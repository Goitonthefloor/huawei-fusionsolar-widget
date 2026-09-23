import QtQuick
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.plasma.components as PlasmaComponents

Item {
    id: tile

    required property string iconName
    required property string caption
    required property string value
    required property color valueColor

    implicitWidth: Kirigami.Units.gridUnit * 4
    implicitHeight: tileColumn.implicitHeight + Kirigami.Units.smallSpacing * 2

    Rectangle {
        anchors.fill: parent
        radius: Kirigami.Units.smallSpacing
        color: Kirigami.Theme.textColor
        opacity: 0.08
    }

    ColumnLayout {
        id: tileColumn
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        anchors.margins: Kirigami.Units.smallSpacing
        spacing: 0

        Kirigami.Icon {
            source: tile.iconName
            implicitWidth: Kirigami.Units.iconSizes.small
            implicitHeight: Kirigami.Units.iconSizes.small
            Layout.alignment: Qt.AlignHCenter
        }

        PlasmaComponents.Label {
            text: tile.value
            font.weight: Font.DemiBold
            color: tile.valueColor
            horizontalAlignment: Text.AlignHCenter
            Layout.fillWidth: true
            elide: Text.ElideRight
        }

        PlasmaComponents.Label {
            text: tile.caption
            opacity: 0.7
            font: Kirigami.Theme.smallFont
            horizontalAlignment: Text.AlignHCenter
            Layout.fillWidth: true
            elide: Text.ElideRight
        }
    }
}
