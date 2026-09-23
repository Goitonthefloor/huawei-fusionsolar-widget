import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami

Kirigami.FormLayout {
    id: page

    property alias cfg_host: hostField.text
    property alias cfg_username: userField.text
    property alias cfg_password: passwordField.text
    property alias cfg_stationDn: stationField.text
    property alias cfg_refreshSeconds: refreshSpin.value

    QQC2.TextField {
        id: hostField
        Kirigami.FormData.label: i18n("Host:")
        placeholderText: i18n("eu5.fusionsolar.huawei.com")
        inputMethodHints: Qt.ImhNoAutoUppercase | Qt.ImhNoPredictiveText | Qt.ImhUrlCharactersOnly
        Layout.fillWidth: true
    }

    QQC2.TextField {
        id: userField
        Kirigami.FormData.label: i18n("Username:")
        inputMethodHints: Qt.ImhNoAutoUppercase | Qt.ImhNoPredictiveText
        Layout.fillWidth: true
    }

    QQC2.TextField {
        id: passwordField
        Kirigami.FormData.label: i18n("Password:")
        echoMode: showPassword.checked ? TextInput.Normal : TextInput.Password
        inputMethodHints: Qt.ImhSensitiveData | Qt.ImhNoPredictiveText
        Layout.fillWidth: true
    }

    QQC2.CheckBox {
        id: showPassword
        text: i18n("Show password")
    }

    QQC2.TextField {
        id: stationField
        Kirigami.FormData.label: i18n("Plant DN:")
        placeholderText: i18n("Leave empty to use the first plant")
        inputMethodHints: Qt.ImhNoAutoUppercase | Qt.ImhNoPredictiveText
        Layout.fillWidth: true
    }

    QQC2.SpinBox {
        id: refreshSpin
        Kirigami.FormData.label: i18n("Refresh:")
        from: 10
        to: 300
        stepSize: 10
        editable: true
        textFromValue: function(value) {
            return i18n("%1 s", value)
        }
        valueFromText: function(text) {
            var parsed = parseInt(text, 10)
            return isNaN(parsed) ? 30 : parsed
        }
    }

    QQC2.Label {
        Layout.fillWidth: true
        wrapMode: Text.WordWrap
        text: i18n("Use the same login as the FusionSolar website. Region hosts such as uni003eu5 are normalized automatically. The password is stored only in the local Plasma configuration.")
    }
}
