import QtQuick
import org.kde.kirigami as Kirigami
import org.kde.plasma.components as PlasmaComponents

Item {
    id: compact

    required property string powerText
    required property string socText
    required property bool vertical

    signal activated()

    implicitWidth: vertical
        ? Math.max(column.implicitWidth, Kirigami.Units.iconSizes.small) + Kirigami.Units.smallSpacing
        : row.implicitWidth + Kirigami.Units.smallSpacing
    implicitHeight: vertical
        ? column.implicitHeight + Kirigami.Units.smallSpacing
        : Math.max(row.implicitHeight, Kirigami.Units.iconSizes.smallMedium)

    Row {
        id: row
        visible: !compact.vertical
        anchors.centerIn: parent
        spacing: Kirigami.Units.smallSpacing

        Kirigami.Icon {
            source: "weather-clear"
            implicitWidth: Kirigami.Units.iconSizes.small
            implicitHeight: Kirigami.Units.iconSizes.small
            anchors.verticalCenter: parent.verticalCenter
        }

        PlasmaComponents.Label {
            text: compact.powerText
            font.weight: Font.DemiBold
            anchors.verticalCenter: parent.verticalCenter
        }

        PlasmaComponents.Label {
            text: compact.socText
            opacity: 0.75
            anchors.verticalCenter: parent.verticalCenter
        }
    }

    Column {
        id: column
        visible: compact.vertical
        anchors.centerIn: parent
        spacing: 0

        Kirigami.Icon {
            source: "weather-clear"
            implicitWidth: Kirigami.Units.iconSizes.small
            implicitHeight: Kirigami.Units.iconSizes.small
            anchors.horizontalCenter: parent.horizontalCenter
        }

        PlasmaComponents.Label {
            text: compact.powerText
            font.weight: Font.DemiBold
            font.pointSize: Math.max(8, Kirigami.Theme.defaultFont.pointSize * 0.8)
            anchors.horizontalCenter: parent.horizontalCenter
        }

        PlasmaComponents.Label {
            text: compact.socText
            opacity: 0.75
            font.pointSize: Math.max(8, Kirigami.Theme.defaultFont.pointSize * 0.75)
            anchors.horizontalCenter: parent.horizontalCenter
        }
    }

    MouseArea {
        anchors.fill: parent
        onClicked: compact.activated()
    }
}
