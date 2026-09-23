import QtQuick
import org.kde.plasma.plasmoid
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.plasma5support as Plasma5Support
import "../code/api.js" as Api

PlasmoidItem {
    id: root

    readonly property string host: String(Plasmoid.configuration.host || "")
    readonly property string username: String(Plasmoid.configuration.username || "")
    readonly property string password: String(Plasmoid.configuration.password || "")
    readonly property string stationDn: String(Plasmoid.configuration.stationDn || "")
    readonly property int refreshSeconds: Math.max(10, Number(Plasmoid.configuration.refreshSeconds || 30))
    readonly property bool configured: host.trim().length > 0 && username.trim().length > 0 && password.length > 0
    readonly property string configToken: host + "\n" + username + "\n" + password + "\n" + stationDn
    readonly property string httpScript: {
        var url = Qt.resolvedUrl("../code/fshttp.py").toString()
        if (url.indexOf("file://") === 0) {
            return decodeURIComponent(url.substring(7))
        }
        return url
    }

    property string powerText: "--"
    property string socText: "--"
    property real socValue: -1
    property string batteryText: "--"
    property string batteryMode: ""
    property string todayText: "--"
    property string houseText: "--"
    property string gridText: "--"
    property string gridMode: ""
    property string stationName: ""
    property string statusText: ""
    property string errorText: ""
    property bool hasData: false
    property bool refreshRunning: false
    property double updatedAt: 0
    property bool started: false
    property var httpCallback: null
    property string httpCommand: ""

    readonly property string updatedText: updatedAt > 0
        ? Qt.formatTime(new Date(updatedAt), Qt.locale().timeFormat(Locale.ShortFormat))
        : ""

    preferredRepresentation: Plasmoid.formFactor === PlasmaCore.Types.Horizontal
        || Plasmoid.formFactor === PlasmaCore.Types.Vertical
        ? compactRepresentation
        : fullRepresentation

    toolTipMainText: i18n("FusionSolar")
    toolTipSubText: {
        if (!configured) {
            return i18n("Add the FusionSolar host, username and password.")
        }
        if (errorText !== "" && !hasData) {
            return errorText
        }
        var lines = []
        if (stationName !== "") {
            lines.push(stationName)
        }
        lines.push(i18n("PV: %1", powerText))
        lines.push(i18n("Battery: %1", socText))
        lines.push(i18n("Today: %1", todayText))
        return lines.join("\n")
    }

    Plasmoid.icon: "weather-clear"
    Plasmoid.status: PlasmaCore.Types.PassiveStatus
    Plasmoid.backgroundHints: PlasmaCore.Types.StandardBackground | PlasmaCore.Types.ConfigurableBackground
    Plasmoid.configurationRequired: !configured
    Plasmoid.configurationRequiredReason: i18n("Add the FusionSolar host, username and password.")

    compactRepresentation: CompactRepresentation {
        powerText: root.powerText
        socText: root.socText
        vertical: Plasmoid.formFactor === PlasmaCore.Types.Vertical
        onActivated: root.expanded = !root.expanded
    }

    fullRepresentation: FullRepresentation {
        powerText: root.powerText
        socText: root.socText
        socValue: root.socValue
        batteryText: root.batteryText
        batteryMode: root.batteryMode
        todayText: root.todayText
        houseText: root.houseText
        gridText: root.gridText
        gridMode: root.gridMode
        stationName: root.stationName
        errorText: root.errorText
        statusText: root.statusText
        updatedText: root.updatedText
        busy: root.refreshRunning
        hasData: root.hasData
        onRefreshRequested: root.refresh()
        onConfigureRequested: root.openConfig()
    }

    Plasma5Support.DataSource {
        id: httpSource
        engine: "executable"
        interval: 0
        connectedSources: []
        onNewData: function(sourceName, data) {
            root.onHttpData(sourceName, data)
        }
    }

    Timer {
        id: refreshTimer
        interval: root.refreshSeconds * 1000
        running: root.configured && root.started
        repeat: true
        onTriggered: root.refresh()
    }

    Timer {
        id: httpTimeout
        interval: 30000
        repeat: false
        onTriggered: {
            root.finishHttp({
                status: 0,
                error: "The request timed out. Check the host, python3, and that Plasma's executable data engine is available.",
                body: "",
                setCookies: [],
                location: "",
                headerMap: {}
            })
        }
    }

    onConfigTokenChanged: {
        if (!started) {
            return
        }
        Api.resetSession()
        clearReading()
        if (configured) {
            refresh()
        }
    }

    Component.onCompleted: {
        ensureApi()
        started = true
        if (configured) {
            refresh()
        }
    }

    function ensureApi() {
        Api.setCryptoUrl(Qt.resolvedUrl("../code/jsrsasign.js"))
        Api.setTransport(function(request, callback) {
            root.sendHttp(request, callback)
        })
    }

    function clearReading() {
        powerText = "--"
        socText = "--"
        socValue = -1
        batteryText = "--"
        batteryMode = ""
        todayText = "--"
        houseText = "--"
        gridText = "--"
        gridMode = ""
        stationName = ""
        statusText = ""
        errorText = ""
        hasData = false
        updatedAt = 0
    }

    function openConfig() {
        var action = Plasmoid.internalAction("configure")
        if (action) {
            action.trigger()
        }
    }

    function describeError(err) {
        var code = err && err.code ? err.code : ""
        if (code === "captcha") {
            return i18n("FusionSolar is asking for a captcha. Sign in once in the browser, then refresh.")
        }
        if (code === "auth") {
            return i18n("FusionSolar rejected the username or password.")
        }
        if (code === "station") {
            return i18n("No matching plant was found for this account.")
        }
        if (code === "crypto") {
            return i18n("The password could not be encrypted.")
        }
        if (code === "transport") {
            return i18n("The widget is not ready to connect yet.")
        }
        if (code === "network") {
            var detail = err && err.message ? String(err.message) : ""
            if (detail !== "") {
                return i18n("Could not reach FusionSolar. %1", detail)
            }
            return i18n("Could not reach FusionSolar. Check the host and that python3 is installed.")
        }
        if (err && err.message) {
            return String(err.message)
        }
        return i18n("Could not update FusionSolar.")
    }

    function refresh() {
        if (!configured || refreshRunning) {
            return
        }
        ensureApi()
        refreshRunning = true
        if (!hasData) {
            statusText = i18n("Connecting…")
        }
        Api.fetchSnapshot({
            host: host.trim(),
            username: username.trim(),
            password: password,
            stationDn: stationDn.trim()
        }).then(function(snapshot) {
            root.applySnapshot(snapshot)
            root.refreshRunning = false
        }, function(err) {
            root.errorText = root.describeError(err)
            root.statusText = ""
            root.refreshRunning = false
        })
    }

    function applySnapshot(snapshot) {
        powerText = snapshot.powerText || "--"
        socText = snapshot.socText || "--"
        socValue = snapshot.soc === null || snapshot.soc === undefined ? -1 : snapshot.soc
        batteryText = snapshot.batteryText || "--"
        batteryMode = snapshot.batteryMode || ""
        todayText = snapshot.todayText || "--"
        houseText = snapshot.houseText || "--"
        gridText = snapshot.gridText || "--"
        gridMode = snapshot.gridMode || ""
        stationName = snapshot.stationName || ""
        updatedAt = snapshot.updatedAt || Date.now()
        hasData = true
        errorText = ""
        statusText = ""
    }

    function sendHttp(request, callback) {
        if (httpCallback) {
            callback({
                status: 0,
                error: "Another request is still running",
                body: "",
                setCookies: [],
                location: "",
                headerMap: {}
            })
            return
        }
        var command = "python3 " + Api.shellQuote(httpScript) + " " + Api.shellQuote(Api.encodeRequest(request)) + " " + Date.now()
        httpCallback = callback
        httpCommand = command
        httpTimeout.restart()
        httpSource.connectSource(command)
    }

    function onHttpData(sourceName, data) {
        if (!data || data["exit code"] === undefined) {
            return
        }
        if (sourceName !== httpCommand) {
            return
        }
        var stdout = String(data["stdout"] || "")
        var parsed = null
        try {
            parsed = JSON.parse(stdout)
        } catch (e) {
            parsed = null
        }
        if (!parsed) {
            var detail = String(data["stderr"] || "").trim()
            finishHttp({
                status: 0,
                error: detail !== "" ? detail : i18n("python3 did not return a response"),
                body: "",
                setCookies: [],
                location: "",
                headerMap: {}
            })
            return
        }
        finishHttp(parsed)
    }

    function finishHttp(result) {
        httpTimeout.stop()
        var callback = httpCallback
        var command = httpCommand
        httpCallback = null
        httpCommand = ""
        if (command !== "") {
            httpSource.disconnectSource(command)
        }
        if (callback) {
            callback(result)
        }
    }
}
