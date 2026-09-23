"use strict"

const crypto = require("crypto")
const fs = require("fs")
const path = require("path")
const vm = require("vm")

const root = path.resolve(__dirname, "..")
const context = {
    console,
    Math,
    Date,
    JSON,
    Intl,
    Promise,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    unescape,
    encodeURIComponent,
    decodeURIComponent,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    Function,
    Uint8Array,
    ArrayBuffer,
    DataView
}
vm.createContext(context)

const apiSource = fs.readFileSync(path.join(root, "contents/code/api.js"), "utf8").replace(/^\.pragma library\s*/, "")
vm.runInContext(apiSource, context, { filename: "api.js" })
vm.runInContext(fs.readFileSync(path.join(root, "contents/code/jsrsasign.js"), "utf8"), context, { filename: "jsrsasign.js" })

let failures = 0
function assert(condition, message) {
    if (!condition) {
        failures += 1
        console.error("FAIL:", message)
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        failures += 1
        console.error("FAIL:", message, "\n  actual:  ", actual, "\n  expected:", expected)
    }
}

assertEqual(context.normalizeHost("https://uni003eu5.fusionsolar.huawei.com/unisso/login.action"), "eu5.fusionsolar.huawei.com", "uni host")
assertEqual(context.normalizeHost("EU5.fusionsolar.huawei.com"), "eu5.fusionsolar.huawei.com", "eu5 host")
assertEqual(context.normalizeHost("region01eu5.fusionsolar.huawei.com"), "eu5.fusionsolar.huawei.com", "region host")
assertEqual(context.normalizeHost("intl.fusionsolar.huawei.com"), "intl.fusionsolar.huawei.com", "intl host")
assertEqual(context.normalizeHost(""), "eu5.fusionsolar.huawei.com", "empty host")
assertEqual(context.normalizeStationDn("NE%3D123"), "NE=123", "encoded station")

const flow = context.parseFlow({
    data: {
        flow: {
            nodes: [
                { name: "neteco.pvms.devTypeLangKey.string", description: { value: "3.25" } },
                { name: "neteco.pvms.KPI.kpiView.electricalLoad", description: { value: "1.10 kW" } },
                {
                    name: "neteco.pvms.devTypeLangKey.energy_store",
                    description: { value: "0.80" },
                    deviceTips: { SOC: "72%", BATTERY_POWER: "500" }
                }
            ],
            links: [
                { description: { label: "neteco.pvms.energy.flow.buy.power", value: "1.35" } }
            ]
        }
    }
})
assertEqual(flow.pvKw, 3.25, "pv")
assertEqual(flow.houseKw, 1.1, "house")
assertEqual(flow.soc, 72, "soc")
assertEqual(flow.batteryChargeKw, 0.8, "charge")
assert(flow.gridKnown && flow.gridExportKw === 1.35 && flow.gridImportKw === 0, "grid export")

const month = []
for (let day = 0; day < 30; day++) month.push(day === 22 ? "12.5" : "0")
assertEqual(context.todayFromMonth({ data: { productPower: month } }, 23), 12.5, "today energy")
assertEqual(context.todayFromMonth({ data: { productPower: ["--"] } }, 1), null, "missing today")

const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 })
const pem = publicKey.export({ type: "spki", format: "pem" })
const password = "Fusion-päss-42"
const encrypted = context.encryptPassword(pem, password)
const decrypted = crypto.privateDecrypt({
    key: privateKey,
    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: "sha384"
}, Buffer.from(encrypted, "base64"))
assertEqual(decrypted.toString("utf8"), password, "oaep sha384")

const calls = []
function replyFor(request) {
    const url = request.url
    if (url.indexOf("/unisso/login.action") !== -1) {
        return { status: 200, body: "<html></html>", setCookies: ["locale=en-us; Path=/"], headerMap: {}, location: "" }
    }
    if (url.indexOf("/unisso/pubkey") !== -1) {
        return {
            status: 200,
            body: JSON.stringify({ pubKey: pem, timeStamp: "1710000000000", version: "v1" }),
            setCookies: [],
            headerMap: {},
            location: ""
        }
    }
    if (url.indexOf("/unisso/v3/validateUser.action") !== -1) {
        return {
            status: 200,
            body: JSON.stringify({ errorCode: "0", respMultiRegionName: ["", "/rest/dp/uidm/auth/v1/on-sso-credential-ready"] }),
            setCookies: [],
            headerMap: {},
            location: ""
        }
    }
    if (url.indexOf("/on-sso-credential-ready") !== -1) {
        return {
            status: 302,
            body: "",
            setCookies: ["dp-session=session-token; Path=/; Secure"],
            headerMap: { location: "https://uni003eu5.fusionsolar.huawei.com/uniportal/pvmswebsite/assets/build/cloud.html" },
            location: "https://uni003eu5.fusionsolar.huawei.com/uniportal/pvmswebsite/assets/build/cloud.html"
        }
    }
    if (url.indexOf("/keep-alive") !== -1) {
        return { status: 200, body: JSON.stringify({ payload: "csrf-token" }), setCookies: [], headerMap: {}, location: "" }
    }
    if (url.indexOf("/station-list") !== -1) {
        return {
            status: 200,
            body: JSON.stringify({ success: true, data: { list: [{ dn: "NE=42", name: "Dach Süd" }] } }),
            setCookies: [],
            headerMap: {},
            location: ""
        }
    }
    if (url.indexOf("/energy-flow") !== -1) {
        return {
            status: 200,
            body: JSON.stringify({
                success: true,
                data: {
                    flow: {
                        nodes: [
                            { name: "neteco.pvms.devTypeLangKey.string", description: { value: "4.50" } },
                            { name: "neteco.pvms.KPI.kpiView.electricalLoad", description: { value: "2.00" } },
                            { name: "neteco.pvms.devTypeLangKey.energy_store", description: { value: "0" }, deviceTips: { SOC: "55", BATTERY_POWER: "0" } }
                        ],
                        links: [{ description: { label: "neteco.pvms.energy.flow.buy.power", value: "0" } }]
                    }
                }
            }),
            setCookies: [],
            headerMap: {},
            location: ""
        }
    }
    if (url.indexOf("/energy-balance") !== -1) {
        const values = []
        const today = new Date().getDate()
        for (let i = 0; i < 31; i++) values.push(i === today - 1 ? "8.25" : "--")
        return {
            status: 200,
            body: JSON.stringify({ success: true, data: { productPower: values } }),
            setCookies: [],
            headerMap: {},
            location: ""
        }
    }
    return { status: 500, body: "unexpected " + url, setCookies: [], headerMap: {}, location: "" }
}

context.setTransport(function(request, callback) {
    calls.push(request)
    callback(replyFor(request))
})

context.fetchSnapshot({
    host: "https://uni003eu5.fusionsolar.huawei.com/portal",
    username: "owner@example.com",
    password: password,
    stationDn: ""
}).then(function(snapshot) {
    assertEqual(snapshot.stationName, "Dach Süd", "station name")
    assertEqual(snapshot.powerText, "4.50 kW", "power text")
    assertEqual(snapshot.socText, "55%", "soc text")
    assertEqual(snapshot.batteryMode, "idle", "battery idle")
    assertEqual(snapshot.todayText, "8.3 kWh", "today text")
    assertEqual(snapshot.houseText, "2.00 kW", "house text")
    assertEqual(snapshot.gridMode, "idle", "grid idle")

    const loginCalls = calls.filter(function(call) { return call.url.indexOf("validateUser.action") !== -1 })
    assertEqual(loginCalls.length, 1, "single login")
    assert(loginCalls[0].url.indexOf("eu5.fusionsolar.huawei.com") !== -1, "login host normalized")
    assert(loginCalls[0].url.indexOf("service=") !== -1, "service param")
    const loginBody = JSON.parse(loginCalls[0].body)
    assert(loginBody.password.endsWith("v1"), "version suffix")
    const cipher = Buffer.from(loginBody.password.slice(0, -2), "base64")
    const plain = crypto.privateDecrypt({
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha384"
    }, cipher)
    assertEqual(plain.toString("utf8"), password, "login password")

    const flowCall = calls.filter(function(call) { return call.url.indexOf("energy-flow") !== -1 }).pop()
    assert(flowCall.headers.Cookie.indexOf("dp-session=session-token") !== -1, "session cookie")
    assertEqual(flowCall.headers.Roarand, "csrf-token", "csrf header")
    assert(flowCall.url.indexOf("uni003eu5.fusionsolar.huawei.com") !== -1, "data host")

    const before = calls.length
    return context.fetchSnapshot({
        host: "https://uni003eu5.fusionsolar.huawei.com/portal",
        username: "owner@example.com",
        password: password,
        stationDn: ""
    }).then(function() {
        const extraLogins = calls.slice(before).filter(function(call) {
            return call.url.indexOf("validateUser.action") !== -1
        })
        assertEqual(extraLogins.length, 0, "session reused")
        if (failures) {
            process.exit(1)
        }
        console.log("api tests passed")
    })
}).catch(function(err) {
    console.error(err)
    process.exit(1)
})
