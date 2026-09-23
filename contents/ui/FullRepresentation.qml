import QtQuick
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.plasma.components as PlasmaComponents

Item {
    id: view

    required property string powerText
    required property string socText
    required property real socValue
    required property string batteryText
    required property string batteryMode
    required property string todayText
    required property string houseText
    required property string gridText
    required property string gridMode
    required property string stationName
    required property string errorText
    required property string statusText
    required property string updatedText
    required property bool busy
    required property bool hasData

    signal refreshRequested()
    signal configureRequested()

    implicitWidth: Kirigami.Units.gridUnit * 16
    implicitHeight: Kirigami.Units.gridUnit * 18

    readonly property string batteryCaption: {
        if (batteryMode === "charge") return i18n("Charging")
        if (batteryMode === "discharge") return i18n("Discharging")
        if (batteryMode === "idle") return i18n("Idle")
        return i18n("Battery")
    }
    readonly property string gridCaption: {
        if (gridMode === "export") return i18n("Export")
        if (gridMode === "import") return i18n("Import")
        if (gridMode === "idle") return i18n("Idle")
        return i18n("Grid")
    }
    readonly property color gridColor: {
        if (gridMode === "export") return Kirigami.Theme.positiveTextColor
        if (gridMode === "import") return Kirigami.Theme.negativeTextColor
        return Kirigami.Theme.textColor
    }
    readonly property color batteryColor: {
        if (socValue >= 0 && socValue < 20) return Kirigami.Theme.negativeTextColor
        if (batteryMode === "charge") return Kirigami.Theme.positiveTextColor
        return Kirigami.Theme.textColor
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Kirigami.Units.largeSpacing
        spacing: Kirigami.Units.largeSpacing

        RowLayout {
            Layout.fillWidth: true
            spacing: Kirigami.Units.smallSpacing

            Kirigami.Icon {
                source: "weather-clear"
                implicitWidth: Kirigami.Units.iconSizes.smallMedium
                implicitHeight: Kirigami.Units.iconSizes.smallMedium
            }

            ColumnLayout {
                Layout.fillWidth: true
                spacing: 0

                PlasmaComponents.Label {
                    text: i18n("FusionSolar")
                    font.weight: Font.DemiBold
                    Layout.fillWidth: true
                    elide: Text.ElideRight
                }

                PlasmaComponents.Label {
                    text: view.stationName !== "" ? view.stationName : i18n("Live plant")
                    opacity: 0.7
                    Layout.fillWidth: true
                    elide: Text.ElideRight
                    font: Kirigami.Theme.smallFont
                }
            }

            Rectangle {
                visible: view.hasData || view.errorText !== ""
                Layout.preferredWidth: Kirigami.Units.smallSpacing + 2
                Layout.preferredHeight: Kirigami.Units.smallSpacing + 2
                radius: width / 2
                color: view.errorText !== ""
                    ? Kirigami.Theme.negativeTextColor
                    : Kirigami.Theme.positiveTextColor
            }

            PlasmaComponents.ToolButton {
                icon.name: "view-refresh"
                enabled: !view.busy
                onClicked: view.refreshRequested()
                Accessible.name: i18n("Refresh")
            }
        }

        ColumnLayout {
            Layout.fillWidth: true
            spacing: Kirigami.Units.smallSpacing

            PlasmaComponents.Label {
                text: view.powerText
                font.pointSize: Kirigami.Theme.defaultFont.pointSize * 1.8
                font.weight: Font.DemiBold
                color: Kirigami.Theme.textColor
                opacity: view.busy && view.hasData ? 0.6 : 1
                Layout.fillWidth: true
            }

            PlasmaComponents.Label {
                text: i18n("PV now")
                opacity: 0.7
                font: Kirigami.Theme.smallFont
            }
        }

        ColumnLayout {
            Layout.fillWidth: true
            spacing: Kirigami.Units.smallSpacing

            RowLayout {
                Layout.fillWidth: true
                spacing: Kirigami.Units.smallSpacing

                Kirigami.Icon {
                    source: view.batteryMode === "charge" ? "battery-charging" : "battery"
                    implicitWidth: Kirigami.Units.iconSizes.small
                    implicitHeight: Kirigami.Units.iconSizes.small
                }

                PlasmaComponents.Label {
                    text: view.batteryCaption
                    Layout.fillWidth: true
                    elide: Text.ElideRight
                }

                PlasmaComponents.Label {
                    text: view.socText
                    font.weight: Font.DemiBold
                    color: view.batteryColor
                }
            }

            PlasmaComponents.ProgressBar {
                Layout.fillWidth: true
                from: 0
                to: 100
                value: view.socValue < 0 ? 0 : view.socValue
                visible: view.socValue >= 0
            }

            PlasmaComponents.Label {
                text: view.batteryMode === "" ? "" : view.batteryText
                visible: view.batteryMode !== ""
                opacity: 0.75
                font: Kirigami.Theme.smallFont
                color: view.batteryColor
            }
        }

        RowLayout {
            Layout.fillWidth: true
            spacing: Kirigami.Units.smallSpacing

            StatTile {
                Layout.fillWidth: true
                iconName: "view-calendar"
                caption: i18n("Today")
                value: view.todayText
                valueColor: Kirigami.Theme.textColor
            }
            StatTile {
                Layout.fillWidth: true
                iconName: "go-home"
                caption: i18n("Home")
                value: view.houseText
                valueColor: Kirigami.Theme.textColor
            }
            StatTile {
                Layout.fillWidth: true
                iconName: view.gridMode === "export" ? "go-up" : view.gridMode === "import" ? "go-down" : "network-connect"
                caption: view.gridCaption
                value: view.gridText
                valueColor: view.gridColor
            }
        }

        Item {
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.minimumHeight: Kirigami.Units.smallSpacing
        }

        PlasmaComponents.Label {
            text: view.statusText
            visible: view.statusText !== ""
            wrapMode: Text.WordWrap
            Layout.fillWidth: true
            horizontalAlignment: Text.AlignHCenter
            opacity: 0.75
        }

        PlasmaComponents.Label {
            text: view.errorText
            visible: view.errorText !== ""
            wrapMode: Text.WordWrap
            Layout.fillWidth: true
            color: Kirigami.Theme.negativeTextColor
            horizontalAlignment: Text.AlignHCenter
        }

        PlasmaComponents.Button {
            visible: view.errorText !== ""
            text: i18n("Configure")
            icon.name: "configure"
            Layout.alignment: Qt.AlignHCenter
            onClicked: view.configureRequested()
        }

        PlasmaComponents.Label {
            text: view.updatedText !== "" ? i18n("Updated %1", view.updatedText) : ""
            visible: view.updatedText !== "" && view.errorText === ""
            opacity: 0.6
            font: Kirigami.Theme.smallFont
            Layout.fillWidth: true
            horizontalAlignment: Text.AlignHCenter
        }
    }
}
