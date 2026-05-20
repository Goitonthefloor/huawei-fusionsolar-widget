# Huawei FusionSolar Plasma Widget

A KDE Plasma widget that displays real-time power, battery state of charge, and today's energy production from Huawei FusionSolar inverters.

## Features

- Shows current power (W), battery SOC (%), and today's energy (kWh)
- Updates every 10 seconds
- Uses Huawei FusionSolar App credentials (username/password)
- Secure credential storage via KDE config
- Error handling and connection status display

## Installation

### Local Installation

1. Clone or download this repository:
   ```bash
   git clone https://github.com/Goitonthefloor/huawei-fusionsolar-widget.git
   cd huawei-fusionsolar-widget
   ```

2. Install the widget:
   ```bash
   plasmapkg2 --install .
   ```

3. Add the widget to your Plasma desktop:
   - Right-click on desktop → Add Widgets → Look for "Huawei FusionSolar Widget"
   - Drag it to your desktop or panel.

### Configuration

After adding the widget, right-click it → Configure Widget to enter:
- **Host**: Your FusionSolar region host (e.g., `uni003eu5.fusionsolar.huawei.com`)
- **Username**: Your FusionSolar App username
- **Password**: Your FusionSolar App password
- **Station DN** (optional): Leave empty to auto-detect

## Development

This widget is implemented as a pure QML/JavaScript Plasmoid with no external backend.

### Key Files

- `metadata.desktop`: Plugin information
- `contents/ui/main.qml`: User interface
- `contents/code/main.js`: Core logic for authentication and data fetching
- `contents/code/jsrsasign.js`: RSA encryption library (included)

### How It Works

1. Uses the same login flow as the Home Assistant FusionSolar App integration.
2. Retrieves RSA public key from the server.
3. Encrypts password with OAEP-SHA384 using jsrsasign.
4. Logs in to obtain session cookies and CSRF token.
5. Fetches station list to get the station DN (if not provided).
6. Requests real-time energy flow data.
7. Extracts:
   - Instantaneous power from PV string node
   - Battery SOC from battery device tips
   - Today's energy (to be implemented via energy balance endpoint)
8. Updates UI every 10 seconds.

## Notes

- Credentials are stored only in your local KDE config (plasmoid.cfg).
- The widget does not store or transmit your credentials elsewhere.
- If you encounter issues, check the widget's error text for details.

## Credits

Based on the authentication flow reverse-engineered from the Home Assistant FusionSolar App integration by @hcraveiro.

## License

GPL-3.0