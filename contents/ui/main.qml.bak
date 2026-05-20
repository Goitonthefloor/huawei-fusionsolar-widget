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
        // Read config values
        var token = plasmoid.configuration.apiToken
        var plantId = plasmoid.configuration.plantId
        if (!token || !plantId) {
            root.statusText = qsTr("Please configure API token and Plant ID in widget settings.")
            return
        }

        // Example endpoint - replace with actual Huawei FusionSolar API URL
        var url = "https://fusionSolar.huawei.com/thirdData/getPlantDetailList"
        var xhr = new XMLHttpRequest()
        xhr.onreadystatechange = function() {
            if (xhr.readyCall !== undefined && xhr.readyState === XMLHttpRequest.DONE) {
                if (xhr.status === 200) {
                    try {
                        var data = JSON.parse(xhr.responseText)
                        // Adjust parsing according to actual response structure
                        // Placeholder: assume data.data[0].plant
                        if (data && data.data && data.data.length > 0) {
                            var plant = data.data[0].plant
                            root.powerText = (plant.power !== undefined) ? plant.power.toFixed(0) : "--"
                            root.socText = (plant.soc !== undefined) ? plant.soc.toFixed(0) : "--"
                            root.todayEnergyText = (plant.todayEnergy !== undefined) ? plant.todayEnergy.toFixed(1) : "--"
                            root.statusText = ""
                        } else {
                            root.statusText = qsTr("Unexpected response format")
                        }
                    } catch (e) {
                        root.statusText = qsTr("Failed to parse response")
                        console.error(e)
                    }
                } else {
                    root.statusText = qsTr("Network error: %1").arg(xhr.status)
                    console.error("HTTP error", xhr.status)
                }
            }
        }
        xhr.open("GET", url)
        xhr.setRequestHeader("Authorization", "Bearer " + token)
        xhr.setRequestHeader("Plant-ID", plantId) // Adjust header name if needed
        xhr.send()
    }
}