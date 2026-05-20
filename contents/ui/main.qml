import QtQuick 2.0
import QtQuick.Controls 2.15 as Controls
import org.kde.plasma.core 2.0 as PlasmaCore
import org.kde.plasma.components 2.0 as PlasmaComponents

PlasmaComponents.Label {
    id: root
    width: 200
    height: 200
    padding: 10

    property string powerText: "--"
    property string socText: "--"
    property string todayEnergyText: "--"
    property string statusText: ""
    property string errorText: ""

    // Configuration properties (will be set via plasmoid.configuration)
    property string apiHost: ""
    property string apiUsername: ""
    property string apiPassword: ""
    property string apiStationDn: ""

    // Expose to plasmoid
    Component.onCompleted: {
        if (plasmoid) {
            plasmoid.apiHost = apiHost
            plasmoid.apiUsername = apiUsername
            plasmoid.apiPassword = apiPassword
            plasmoid.apiStationDn = apiStationDn
        }
    }

    Column {
        anchors.fill: parent
        spacing: 10

        Row {
            Label {
                text: qsTr("Power:")
                font.bold: true
                width: 80
                horizontalAlignment: Text.AlignLeft
                color: PlasmaCore.theme.textColor
            }
            Label {
                text: root.powerText + " W"
                font.family: "Monospace"
                horizontalAlignment: Text.AlignRight
                color: PlasmaCore.theme.textColor
            }
        }

        Row {
            Label {
                text: qsTr("Battery:")
                font.bold: true
                width: 80
                horizontalAlignment: Text.AlignLeft
                color: PlasmaCore.theme.textColor
            }
            Label {
                text: root.socText + " %"
                font.family: "Monospace"
                horizontalAlignment: Text.AlignRight
                color: PlasmaCore.theme.textColor
            }
        }

        Row {
            Label {
                text: qsTr("Today:")
                font.bold: true
                width: 80
                horizontalAlignment: Text.AlignLeft
                color: PlasmaCore.theme.textColor
            }
            Label {
                text: root.todayEnergyText + " kWh"
                font.family: "Monospace"
                horizontalAlignment: Text.AlignRight
                color: PlasmaCore.theme.textColor
            }
        }

        Label {
            text: root.statusText
            wrapMode: Text.WordWrap
            horizontalAlignment: Text.AlignHCenter
            color: PlasmaCore.theme.warningColor
            visible: root.statusText !== ""
        }

        Label {
            text: root.errorText
            wrapMode: Text.WordWrap
            horizontalAlignment: Text.AlignHCenter
            color: PlasmaCore.theme.alertColor
            visible: root.errorText !== ""
        }
    }

    // Load the RSA library
    Component.onCompleted: {
        if (plasmoid) {
            plasmoid.loadScript("contents/code/jsrsasign.js")
        }
    }

    // Timer to update every 10 seconds
    Timer {
        interval: 10000
        running: true
        repeat: true
        onTriggered: root.fetchData()
    }

    // Called once when component is completed
    Component.onCompleted: {
        root.fetchData()
    }

    function fetchData() {
        if (!apiHost || !apiUsername || !apiPassword) {
            root.statusText = qsTr("Please configure host, username, and password in widget settings.")
            root.errorText = ""
            return
        }
        root.statusText = qsTr("Fetching...")
        root.errorText = ""

        // We'll implement the login and data fetching as a chain of promises
        window.FusionSolar = window.FusionSolar || {}
        window.FusionSolar.host = apiHost
        window.FusionSolar.username = apiUsername
        window.FusionSolar.password = apiPassword
        window.FusionSolar.stationDn = apiStationDn

        // Start the process
        window.FusionSolar.loginAndFetch().then(function(result) {
            // Update UI
            root.powerText = result.power !== null ? result.power.toFixed(0) : "--"
            root.socText = result.soc !== null ? result.soc.toFixed(0) : "--"
            root.todayEnergyText = result.todayEnergy !== null ? result.todayEnergy.toFixed(1) : "--"
            root.statusText = ""
            root.errorText = ""
        }).catch(function(err) {
            console.error("FusionSolar error:", err)
            root.statusText = ""
            root.errorText = qsTr("Error: %1").arg(err.toString())
        })
    }
}
