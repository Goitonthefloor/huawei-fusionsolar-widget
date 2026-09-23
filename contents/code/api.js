.pragma library

var httpTransport = null
var cryptoLoaded = false
var cryptoUrl = ""
var session = emptySession()

function emptySession() {
    return {
        fingerprint: "",
        loginHost: "",
        dataHost: "",
        dpSession: "",
        csrf: "",
        csrfAt: 0,
        stationDn: "",
        stationName: "",
        loggedIn: false,
        cookies: {}
    }
}

function setTransport(fn) {
    httpTransport = fn
}

function setCryptoUrl(url) {
    cryptoUrl = String(url || "")
}

function resetSession() {
    session = emptySession()
}

function error(code, message) {
    var err = new Error(message)
    err.code = code
    return err
}

function normalizeHost(host) {
    if (!host || typeof host !== "string") {
        return "eu5.fusionsolar.huawei.com"
    }
    var normalized = host.trim().toLowerCase()
    normalized = normalized.replace(/^https?:\/\//, "")
    normalized = normalized.split("/")[0]
    normalized = normalized.split(":")[0]
    var suffix = ".fusionsolar.huawei.com"
    if (normalized.slice(-suffix.length) === suffix) {
        normalized = normalized.slice(0, -suffix.length)
    }
    var match = /^(?:region|uni)\d+([a-z]+\d+)$/.exec(normalized)
    if (match) {
        normalized = match[1]
    }
    if (!normalized) {
        normalized = "eu5"
    }
    return normalized + suffix
}

function normalizeStationDn(stationDn) {
    if (!stationDn) {
        return ""
    }
    var value = String(stationDn).trim()
    if (value.indexOf("%") !== -1) {
        try {
            return decodeURIComponent(value)
        } catch (e) {
            return value
        }
    }
    return value
}

function usesPlainLogin(host) {
    return host.indexOf("la5.") !== -1 || host.indexOf("intl.") !== -1
}

function extractNumeric(value) {
    if (value === null || value === undefined) {
        return null
    }
    if (typeof value === "number") {
        return isFinite(value) ? value : null
    }
    var text = String(value).trim()
    if (!text || text === "--" || text === "null") {
        return null
    }
    var token = text.split(/\s+/)[0].replace(",", ".")
    var number = parseFloat(token)
    return isNaN(number) ? null : number
}

function formatKw(value) {
    if (value === null || value === undefined || isNaN(value)) {
        return "--"
    }
    var digits = Math.abs(value) >= 10 ? 1 : 2
    return value.toFixed(digits) + " kW"
}

function formatKwh(value) {
    if (value === null || value === undefined || isNaN(value)) {
        return "--"
    }
    return value.toFixed(1) + " kWh"
}

function formatPercent(value) {
    if (value === null || value === undefined || isNaN(value)) {
        return "--"
    }
    return Math.round(value) + "%"
}

function pad(number) {
    return (number < 10 ? "0" : "") + number
}

function formatLocalDateTime(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate())
        + " " + pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds())
}

function monthQuery(now) {
    var start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
    var zone = "UTC"
    try {
        zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    } catch (e) {
        zone = "UTC"
    }
    return {
        timeDim: "4",
        queryTime: start.getTime(),
        timeZone: String(-start.getTimezoneOffset() / 60),
        timeZoneStr: zone,
        dateStr: formatLocalDateTime(start)
    }
}

function todayFromMonth(data, dayOfMonth) {
    if (!data || !data.data || !data.data.productPower) {
        return null
    }
    var list = data.data.productPower
    var index = dayOfMonth - 1
    if (index < 0 || index >= list.length) {
        return null
    }
    return extractNumeric(list[index])
}

function parseFlow(data) {
    var flow = data && data.data && data.data.flow ? data.data.flow : {}
    var nodes = flow.nodes || []
    var links = flow.links || []
    var out = {
        pvKw: null,
        houseKw: null,
        soc: null,
        hasBattery: false,
        batteryChargeKw: 0,
        batteryDischargeKw: 0,
        gridImportKw: 0,
        gridExportKw: 0,
        gridKnown: false
    }

    for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i] || {}
        var label = node.name || ""
        var description = node.description || {}
        var value = extractNumeric(description.value)
        if (label === "neteco.pvms.devTypeLangKey.string") {
            out.pvKw = value
        } else if (label === "neteco.pvms.KPI.kpiView.electricalLoad") {
            out.houseKw = value
        } else if (label === "neteco.pvms.devTypeLangKey.energy_store") {
            out.hasBattery = true
            var tips = node.deviceTips || {}
            var soc = extractNumeric(tips.SOC)
            if (soc !== null) {
                out.soc = soc
            }
            var direction = extractNumeric(tips.BATTERY_POWER)
            var magnitude = value === null ? 0 : value
            if (direction === null || direction <= 0) {
                out.batteryDischargeKw = magnitude
                out.batteryChargeKw = 0
            } else {
                out.batteryChargeKw = magnitude
                out.batteryDischargeKw = 0
            }
        }
    }

    for (var j = 0; j < links.length; j++) {
        var link = links[j] || {}
        var linkDescription = link.description || {}
        if (linkDescription.label !== "neteco.pvms.energy.flow.buy.power") {
            continue
        }
        var gridValue = extractNumeric(linkDescription.value)
        var gridMagnitude = gridValue === null ? 0 : gridValue
        var produced = (out.pvKw || 0) + (out.batteryDischargeKw || 0)
        var consumed = (out.batteryChargeKw || 0) + (out.houseKw || 0)
        out.gridKnown = true
        if (produced - consumed > 0) {
            out.gridExportKw = gridMagnitude
            out.gridImportKw = 0
        } else {
            out.gridImportKw = gridMagnitude
            out.gridExportKw = 0
        }
    }
    return out
}

function buildSnapshot(flow, todayKwh) {
    var batteryMode = ""
    var batteryKw = null
    if (flow.hasBattery) {
        if (flow.batteryChargeKw > 0) {
            batteryMode = "charge"
            batteryKw = flow.batteryChargeKw
        } else if (flow.batteryDischargeKw > 0) {
            batteryMode = "discharge"
            batteryKw = flow.batteryDischargeKw
        } else {
            batteryMode = "idle"
            batteryKw = 0
        }
    }

    var gridMode = ""
    var gridKw = null
    if (flow.gridKnown) {
        if (flow.gridExportKw > 0) {
            gridMode = "export"
            gridKw = flow.gridExportKw
        } else if (flow.gridImportKw > 0) {
            gridMode = "import"
            gridKw = flow.gridImportKw
        } else {
            gridMode = "idle"
            gridKw = 0
        }
    }

    return {
        stationName: session.stationName || "",
        powerText: formatKw(flow.pvKw),
        soc: flow.soc,
        socText: formatPercent(flow.soc),
        batteryText: formatKw(batteryKw),
        batteryMode: batteryMode,
        todayText: formatKwh(todayKwh),
        houseText: formatKw(flow.houseKw),
        gridText: formatKw(gridKw),
        gridMode: gridMode,
        updatedAt: Date.now()
    }
}

function shellQuote(value) {
    return "'" + String(value).replace(/'/g, "'\\''") + "'"
}

function utf8Bytes(str) {
    var binary = unescape(encodeURIComponent(String(str)))
    var bytes = []
    for (var i = 0; i < binary.length; i++) {
        bytes.push(binary.charCodeAt(i))
    }
    return bytes
}

function bytesToBase64(bytes) {
    var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    var out = ""
    for (var i = 0; i < bytes.length; i += 3) {
        var b0 = bytes[i]
        var b1 = i + 1 < bytes.length ? bytes[i + 1] : 0
        var b2 = i + 2 < bytes.length ? bytes[i + 2] : 0
        var triplet = (b0 << 16) | (b1 << 8) | b2
        out += alphabet.charAt((triplet >> 18) & 63)
        out += alphabet.charAt((triplet >> 12) & 63)
        out += i + 1 < bytes.length ? alphabet.charAt((triplet >> 6) & 63) : "="
        out += i + 2 < bytes.length ? alphabet.charAt(triplet & 63) : "="
    }
    return out
}

function encodeRequest(request) {
    return bytesToBase64(utf8Bytes(JSON.stringify({
        method: request.method || "GET",
        url: request.url,
        headers: request.headers || {},
        body: request.body === undefined ? null : request.body,
        timeout: 25
    })))
}

function hexToBase64(hex) {
    var clean = String(hex || "").replace(/\s/g, "")
    if (!clean || clean.length % 2 !== 0) {
        throw error("crypto", "Password encryption returned an incomplete value")
    }
    var bytes = []
    for (var i = 0; i < clean.length; i += 2) {
        bytes.push(parseInt(clean.substr(i, 2), 16))
    }
    return bytesToBase64(bytes)
}

function loadCrypto() {
    if (cryptoLoaded) {
        return
    }
    if (typeof KEYUTIL === "undefined" && typeof Qt !== "undefined" && Qt.include) {
        Qt.include(cryptoUrl || "jsrsasign.js")
    }
    if (typeof KEYUTIL === "undefined" || typeof KJUR === "undefined" || !KJUR.crypto || !KJUR.crypto.Cipher) {
        throw error("crypto", "RSA library failed to load")
    }
    cryptoLoaded = true
}

function encryptPassword(pem, password) {
    loadCrypto()
    var binary = unescape(encodeURIComponent(password))
    var key = KEYUTIL.getKey(pem)
    var hex = KJUR.crypto.Cipher.encrypt(binary, key, "RSAOAEP384")
    if (!hex) {
        throw error("crypto", "Password encryption failed")
    }
    return hexToBase64(hex)
}

function generateNonce() {
    var out = ""
    for (var i = 0; i < 32; i++) {
        out += Math.floor(Math.random() * 16).toString(16)
    }
    return out
}

function parseJson(text) {
    if (!text) {
        return null
    }
    try {
        return JSON.parse(text)
    } catch (e) {
        return null
    }
}

function resolveUrl(base, location) {
    if (!location) {
        return base
    }
    if (/^https?:\/\//i.test(location)) {
        return location
    }
    var originMatch = /^(https?:\/\/[^\/]+)/i.exec(base)
    var origin = originMatch ? originMatch[1] : ""
    if (location.charAt(0) === "/") {
        return origin + location
    }
    var withoutQuery = base.split("?")[0].split("#")[0]
    var slash = withoutQuery.lastIndexOf("/")
    var dir = slash >= 0 ? withoutQuery.slice(0, slash + 1) : origin + "/"
    return dir + location
}

function absorbCookies(response) {
    var cookies = response && response.setCookies ? response.setCookies : []
    for (var i = 0; i < cookies.length; i++) {
        var piece = String(cookies[i] || "").split(";")[0]
        var eq = piece.indexOf("=")
        if (eq <= 0) {
            continue
        }
        var name = piece.slice(0, eq).trim()
        var value = piece.slice(eq + 1).trim()
        if (name) {
            session.cookies[name] = value
        }
    }
    if (session.cookies["dp-session"]) {
        session.dpSession = session.cookies["dp-session"]
    }
}

function cookieHeader() {
    var names = []
    for (var name in session.cookies) {
        if (session.cookies.hasOwnProperty(name)) {
            names.push(name)
        }
    }
    names.sort()
    var parts = []
    for (var i = 0; i < names.length; i++) {
        parts.push(names[i] + "=" + session.cookies[names[i]])
    }
    if (!session.cookies.locale) {
        parts.push("locale=en-us")
    }
    return parts.join("; ")
}

function browserHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    }
}

function dataHeaders(jsonBody) {
    var headers = browserHeaders()
    headers.Accept = "application/json, text/plain, */*"
    headers.Referer = "https://" + session.dataHost + "/uniportal/pvmswebsite/assets/build/cloud.html"
    headers.Origin = "https://" + session.dataHost
    headers["X-Requested-With"] = "XMLHttpRequest"
    headers.Cookie = cookieHeader()
    if (session.csrf) {
        headers.Roarand = session.csrf
    }
    if (jsonBody) {
        headers["Content-Type"] = "application/json"
    }
    return headers
}

function http(options) {
    if (!httpTransport) {
        return Promise.reject(error("transport", "HTTP transport is not ready"))
    }
    return new Promise(function(resolve, reject) {
        try {
            httpTransport(options, function(result) {
                if (!result) {
                    reject(error("network", "Empty HTTP result"))
                    return
                }
                if (result.error && !result.status) {
                    reject(error("network", String(result.error)))
                    return
                }
                resolve(result)
            })
        } catch (e) {
            reject(error("network", e && e.message ? e.message : String(e)))
        }
    })
}

function ensureOk(response, what) {
    absorbCookies(response)
    if (!response || response.status === 401 || response.status === 403) {
        throw error("auth-expired", what + " was rejected")
    }
    if (!response.status || response.status < 200 || response.status >= 300) {
        throw error("http", what + " failed (HTTP " + (response ? response.status : 0) + ")")
    }
    var data = parseJson(response.body)
    if (!data) {
        throw error("parse", what + " response was not valid JSON")
    }
    if (data.success === false) {
        throw error("auth-expired", what + " was rejected")
    }
    return data
}

function headerValue(response, name) {
    var map = response && response.headerMap ? response.headerMap : {}
    var value = map[String(name).toLowerCase()]
    return value ? String(value) : ""
}

function extractRedirect(loginResponse) {
    if (!loginResponse) {
        return ""
    }
    if (loginResponse.respMultiRegionName && loginResponse.respMultiRegionName.length > 1 && loginResponse.respMultiRegionName[1]) {
        return String(loginResponse.respMultiRegionName[1])
    }
    if (loginResponse.redirectURL) {
        return String(loginResponse.redirectURL)
    }
    if (loginResponse.redirectUrl) {
        return String(loginResponse.redirectUrl)
    }
    return ""
}

function loginFailure(parsed) {
    var code = parsed && parsed.errorCode !== undefined ? String(parsed.errorCode) : ""
    var message = parsed && parsed.errorMsg ? String(parsed.errorMsg) : ""
    if (code === "411" || (parsed && parsed.verifyCodeCreate)) {
        return error("captcha", message || "Captcha required")
    }
    if (code === "406") {
        return error("auth", message || "Invalid username or password")
    }
    return error("auth", message || "Login response did not include redirect information")
}

function interpretLogin(response) {
    if (!response || response.status !== 200) {
        return { kind: "retry" }
    }
    var parsed = parseJson(response.body)
    if (!parsed) {
        return { kind: "retry" }
    }
    var redirect = extractRedirect(parsed)
    if (redirect) {
        return { kind: "ok", parsed: parsed, redirect: redirect }
    }
    var code = parsed.errorCode !== undefined ? String(parsed.errorCode) : ""
    if (code === "411" || parsed.verifyCodeCreate) {
        return { kind: "captcha", parsed: parsed }
    }
    return { kind: "retry", parsed: parsed }
}

function completeSession(host, redirectValue, referer) {
    var redirectUrl = resolveUrl("https://" + host + "/", redirectValue)
    var headers = browserHeaders()
    headers.Accept = "text/html,application/xhtml+xml"
    headers.Referer = referer
    headers.Cookie = cookieHeader()
    return http({ method: "GET", url: redirectUrl, headers: headers }).then(function(response) {
        absorbCookies(response)
        if (!session.cookies["dp-session"]) {
            throw error("auth", "Login did not return a session cookie")
        }
        var location = headerValue(response, "location") || response.location || ""
        var dataHost = host
        if (location) {
            var absolute = resolveUrl(redirectUrl, location)
            var match = /^https?:\/\/([^\/:?#]+)/i.exec(absolute)
            if (match) {
                dataHost = match[1]
            }
        }
        session.loginHost = host
        session.dataHost = dataHost
        session.dpSession = session.cookies["dp-session"]
        session.loggedIn = true
    })
}

function loginEu5(options, host) {
    var origin = "https://" + host
    var service = "/unisess/v1/auth?service=%2Fnetecowebext%2Fhome%2Findex.html"
    var loginPage = origin + "/unisso/login.action?service=" + encodeURIComponent(service)
    var warmHeaders = browserHeaders()
    warmHeaders.Accept = "text/html"

    return http({ method: "GET", url: loginPage, headers: warmHeaders }).then(function(response) {
        absorbCookies(response)
    }, function() {
        return null
    }).then(function() {
        var headers = browserHeaders()
        headers.Accept = "application/json"
        headers.Referer = loginPage
        return http({ method: "GET", url: origin + "/unisso/pubkey", headers: headers })
    }).then(function(response) {
        absorbCookies(response)
        if (!response || response.status !== 200) {
            throw error("network", "Could not fetch the FusionSolar public key")
        }
        var keyData = parseJson(response.body)
        if (!keyData || !keyData.pubKey || keyData.timeStamp === undefined) {
            throw error("parse", "Public key response was not valid")
        }
        var encrypted = encryptPassword(keyData.pubKey, options.password) + String(keyData.version || "")
        var nonce = generateNonce()
        var payload = JSON.stringify({
            organizationName: "",
            username: options.username,
            password: encrypted,
            multiRegionName: ""
        })

        function attempt(useService) {
            var referer = origin + "/unisso/login.action"
            var url = origin + "/unisso/v3/validateUser.action?timeStamp="
                + encodeURIComponent(String(keyData.timeStamp)) + "&nonce=" + nonce
            if (useService) {
                url += "&service=" + encodeURIComponent(service)
                referer += "?service=" + encodeURIComponent(service)
            }
            var headers = browserHeaders()
            headers["Content-Type"] = "application/json"
            headers.Accept = "application/json"
            headers.Origin = origin
            headers.Referer = referer
            headers["X-Requested-With"] = "XMLHttpRequest"
            headers.Cookie = cookieHeader()
            return http({ method: "POST", url: url, headers: headers, body: payload }).then(function(loginResponse) {
                absorbCookies(loginResponse)
                return loginResponse
            })
        }

        return attempt(true).then(function(first) {
            var firstResult = interpretLogin(first)
            if (firstResult.kind === "ok") {
                return { redirect: firstResult.redirect, referer: origin + "/pvmswebsite/loginCustomize.html" }
            }
            if (firstResult.kind === "captcha") {
                throw loginFailure(firstResult.parsed)
            }
            return attempt(false).then(function(second) {
                var secondResult = interpretLogin(second)
                if (secondResult.kind === "ok") {
                    return { redirect: secondResult.redirect, referer: origin + "/unisso/login.action" }
                }
                throw loginFailure(secondResult.parsed || firstResult.parsed || {})
            })
        }).then(function(result) {
            return completeSession(host, result.redirect, result.referer)
        })
    })
}

function loginLa5(options, host) {
    var origin = "https://" + host
    var headers = browserHeaders()
    headers.Accept = "text/html"
    return http({ method: "GET", url: origin + "/", headers: headers }).then(function(response) {
        absorbCookies(response)
        var loginHeaders = browserHeaders()
        loginHeaders["Content-Type"] = "application/json;charset=UTF-8"
        loginHeaders.Accept = "application/json, text/plain, */*"
        loginHeaders.Origin = origin
        loginHeaders.Referer = origin + "/"
        loginHeaders["X-Requested-With"] = "XMLHttpRequest"
        loginHeaders.Cookie = cookieHeader()
        return http({
            method: "POST",
            url: origin + "/rest/dp/uidm/unisso/v1/validate-user?service=%2Frest%2Fdp%2Fuidm%2Fauth%2Fv1%2Fon-sso-credential-ready",
            headers: loginHeaders,
            body: JSON.stringify({
                username: options.username,
                password: options.password,
                organizationName: ""
            })
        })
    }).then(function(response) {
        absorbCookies(response)
        if (!response || response.status !== 200) {
            throw error("auth", "Login failed")
        }
        var redirectUrl = headerValue(response, "redirect_url")
        if (!redirectUrl) {
            throw error("auth", "Login response did not include redirect information")
        }
        var followHeaders = browserHeaders()
        followHeaders.Accept = "text/html"
        followHeaders.Cookie = cookieHeader()
        return http({ method: "GET", url: resolveUrl(origin + "/", redirectUrl), headers: followHeaders })
    }).then(function(response) {
        absorbCookies(response)
        var finalHeaders = browserHeaders()
        finalHeaders.Accept = "application/json, text/plain, */*"
        finalHeaders.Cookie = cookieHeader()
        return http({
            method: "GET",
            url: origin + "/rest/pvms/web/login/v1/redirecturl?isFirst=false",
            headers: finalHeaders
        })
    }).then(function(response) {
        absorbCookies(response)
        if (!session.cookies["dp-session"]) {
            throw error("auth", "Login did not return a session cookie")
        }
        session.loginHost = host
        session.dataHost = host
        session.dpSession = session.cookies["dp-session"]
        session.loggedIn = true
    })
}

function ensureLogin(options) {
    if (session.loggedIn && session.dpSession && session.dataHost) {
        return Promise.resolve()
    }
    var host = normalizeHost(options.host)
    if (usesPlainLogin(host)) {
        return loginLa5(options, host)
    }
    return loginEu5(options, host)
}

function refreshCsrf(force) {
    if (!force && session.csrf && (Date.now() - session.csrfAt) < 5 * 60 * 1000) {
        return Promise.resolve(session.csrf)
    }
    return http({
        method: "GET",
        url: "https://" + session.dataHost + "/rest/dpcloud/auth/v1/keep-alive",
        headers: dataHeaders(false)
    }).then(function(response) {
        var data = ensureOk(response, "Session")
        var token = data && data.payload ? String(data.payload) : ""
        if (!token) {
            throw error("auth-expired", "Session expired")
        }
        session.csrf = token
        session.csrfAt = Date.now()
        return token
    })
}

function resolveStation(options) {
    return http({
        method: "POST",
        url: "https://" + session.dataHost + "/rest/pvms/web/station/v1/station/station-list",
        headers: dataHeaders(true),
        body: JSON.stringify({
            curPage: 1,
            pageSize: 10,
            gridConnectedTime: "",
            queryTime: 1666044000000,
            timeZone: 2,
            sortId: "createTime",
            sortDir: "DESC",
            locale: "en_US"
        })
    }).then(function(response) {
        var data = ensureOk(response, "Plant list")
        var stations = data && data.data && data.data.list ? data.data.list : []
        if (!stations.length) {
            throw error("station", "No plants were returned for this account")
        }
        var wanted = normalizeStationDn(options.stationDn || "")
        var selected = null
        if (!wanted) {
            selected = stations[0]
        } else {
            for (var i = 0; i < stations.length; i++) {
                if (stations[i] && stations[i].dn === wanted) {
                    selected = stations[i]
                    break
                }
            }
            if (!selected) {
                throw error("station", "Plant DN was not found on this account")
            }
        }
        session.stationDn = selected.dn
        session.stationName = selected.name || selected.dn || ""
    })
}

function fetchFlow() {
    var url = "https://" + session.dataHost + "/rest/pvms/web/station/v2/overview/energy-flow?stationDn="
        + encodeURIComponent(session.stationDn)
    return http({ method: "GET", url: url, headers: dataHeaders(false) }).then(function(response) {
        var data = ensureOk(response, "Energy flow")
        if (!data.data || !data.data.flow) {
            throw error("parse", "Energy flow response was not valid")
        }
        return parseFlow(data)
    })
}

function fetchToday() {
    var now = new Date()
    var query = monthQuery(now)
    var pairs = [
        ["stationDn", session.stationDn],
        ["timeDim", query.timeDim],
        ["queryTime", String(query.queryTime)],
        ["timeZone", query.timeZone],
        ["timeZoneStr", query.timeZoneStr],
        ["dateStr", query.dateStr],
        ["_", String(Date.now())]
    ]
    var encoded = []
    for (var i = 0; i < pairs.length; i++) {
        encoded.push(encodeURIComponent(pairs[i][0]) + "=" + encodeURIComponent(pairs[i][1]))
    }
    var url = "https://" + session.dataHost + "/rest/pvms/web/station/v2/overview/energy-balance?" + encoded.join("&")
    return http({ method: "GET", url: url, headers: dataHeaders(false) }).then(function(response) {
        var data = ensureOk(response, "Energy balance")
        return todayFromMonth(data, now.getDate())
    })
}

function loadSnapshot(options) {
    return refreshCsrf(false).then(function() {
        return resolveStation(options)
    }).then(function() {
        return refreshCsrf(false)
    }).then(function() {
        return fetchFlow()
    }).then(function(flow) {
        return fetchToday().then(function(todayKwh) {
            return buildSnapshot(flow, todayKwh)
        }, function() {
            return buildSnapshot(flow, null)
        })
    })
}

function credentialKey(options) {
    return [
        normalizeHost(options.host),
        String(options.username || ""),
        String(options.password || ""),
        normalizeStationDn(options.stationDn || "")
    ].join("\n")
}

function fetchSnapshot(options) {
    var key = credentialKey(options)
    if (session.fingerprint !== key) {
        session = emptySession()
        session.fingerprint = key
    }
    return ensureLogin(options).then(function() {
        return loadSnapshot(options)
    }).catch(function(err) {
        if (err && err.code === "auth-expired" && !options._retried) {
            session = emptySession()
            session.fingerprint = key
            return fetchSnapshot({
                host: options.host,
                username: options.username,
                password: options.password,
                stationDn: options.stationDn,
                _retried: true
            })
        }
        throw err
    })
}
