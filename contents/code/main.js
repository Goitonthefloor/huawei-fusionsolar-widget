// Huawei FusionSolar Widget Logic
// Uses jsrsasign for RSA encryption (included via import in QML)

var FusionSolar = {
    // Configuration (will be set from plasmoid.configuration)
    host: "", // e.g., uni003eu5.fusionsolar.huawei.com
    username: "",
    password: "",
    stationDn: "", // optional, will be fetched if empty
    
    // State
    connected: false,
    dpSession: "",
    dataHost: "",
    csrfToken: "",
    
    // Timers
    timer: null,
    
    // Initialize
    init: function(config) {
        this.host = config.host || "";
        this.username = config.username || "";
        this.password = config.password || "";
        this.stationDn = config.stationDn || "";
        
        // Start update timer (10 seconds)
        if (this.timer) clearInterval(this.timer);
        this.timer = setInterval(function() {
            FusionSolar.updateData();
        }, 10000);
        
        // Initial fetch
        this.updateData();
    },
    
    // Main update function
    updateData: function() {
        if (!this.host || !this.username || !this.password) {
            // Not configured yet
            return;
        }
        
        this.loginAndFetch()
            .catch(function(err) {
                console.error("FusionSolar update error:", err);
                // Update UI with error via plasmoid.dataChanged?
                // We'll expose error via a property that QML can bind to
                if (typeof plasmoid !== 'undefined') {
                    plasmoid.dataChanged = true; // Trigger update
                    plasmoid.lastError = err.toString();
                }
            });
    },
    
    // Login and fetch data
    loginAndFetch: function() {
        var self = this;
        return new Promise(function(resolve, reject) {
            self.getPublicKey()
                .then(function(pubKeyInfo) {
                    return self.login(pubKeyInfo);
                })
                .then(function(loginResult) {
                    // loginResult contains dpSession and dataHost
                    self.dpSession = loginResult.dpSession;
                    self.dataHost = loginResult.dataHost;
                    self.csrfToken = loginResult.csrfToken;
                    return self.getStationList();
                })
                .then(function(stationList) {
                    // Determine station DN
                    var dn = self.stationDn;
                    if (!dn && stationList && stationList.data && stationList.data.list && stationList.data.list.length > 0) {
                        dn = stationList.data.list[0].stationDn;
                    }
                    if (!dn) {
                        throw new Error("Could not determine station DN");
                    }
                    return self.fetchOverviewData(dn);
                })
                .then(function(overviewData) {
                    // Parse overview data to extract power, soc, todayEnergy
                    var result = self.parseOverviewData(overviewData);
                    // Store results where QML can access them
                    if (typeof plasmoid !== 'undefined') {
                        plasmoid.powerText = result.power !== null ? result.power.toFixed(0) : "--";
                        plasmoid.socText = result.soc !== null ? result.soc.toFixed(0) : "--";
                        plasmoid.todayEnergyText = result.todayEnergy !== null ? result.todayEnergy.toFixed(1) : "--";
                        plasmoid.lastError = "";
                        plasmoid.dataChanged = true;
                    }
                    resolve(result);
                })
                .catch(function(err) {
                    reject(err);
                });
        });
    },
    
    // Step 1: Get public key
    getPublicKey: function() {
        var self = this;
        return new Promise(function(resolve, reject) {
            var url = "https://" + self.host + "/unisso/pubkey";
            var xhr = new XMLHttpRequest();
            xhr.open("GET", url, true);
            xhr.onreadystatechange = function() {
                if (xhr.readyState === XMLHttpRequest.DONE) {
                    if (xhr.status === 200) {
                        try {
                            var data = JSON.parse(xhr.responseText);
                            resolve({
                                pubKey: data.pubKey,
                                timeStamp: data.timeStamp,
                                version: data.version
                            });
                        } catch (e) {
                            reject(new Error("Invalid public key response"));
                        }
                    } else {
                        reject(new Error("Failed to get public key: HTTP " + xhr.status));
                    }
                }
            };
            xhr.onerror = function() {
                reject(new Error("Network error getting public key"));
            };
            xhr.send();
        });
    },
    
    // Step 2: Login
    login: function(pubKeyInfo) {
        var self = this;
        return new Promise(function(resolve, reject) {
            // Encrypt password using RSA OAEP with SHA-384
            // We'll use jsrsasign (loaded as JsRSA in QML, but here we need to access it)
            // Since we are in a JS file imported as module, we can't directly access JsRSA.
            // Instead, we'll include the encryption logic here using jsrsasign via global?
            // For simplicity, we assume the jsrsasign library is loaded globally via the script tag in QML.
            // However, in this JS file we can't guarantee that.
            // We'll implement a simple fallback: we'll call a function exposed by QML.
            // Better: we'll move the login logic to QML where we can import jsrsasign easily.
            // For now, we'll reject and note that encryption needs to be done in QML.
            reject(new Error("Login encryption not implemented in JS - move to QML"));
        });
    },
    
    // Placeholder for other steps
    getStationList: function() {
        var self = this;
        return new Promise(function(resolve, reject) {
            var url = "https://" + self.dataHost + "/rest/pvms/web/station/v1/station/station-list";
            var xhr = new XMLHttpRequest();
            xhr.open("GET", url, true);
            xhr.setRequestHeader("Cookie", "dp-session=" + self.dpSession);
            xhr.setRequestHeader("CSRF", self.csrfToken);
            xhr.onreadystatechange = function() {
                if (xhr.readyState === XMLHttpRequest.DONE) {
                    if (xhr.status === 200) {
                        try {
                            var data = JSON.parse(xhr.responseText);
                            resolve(data);
                        } catch (e) {
                            reject(new Error("Invalid station list response"));
                        }
                    } else {
                        reject(new Error("Failed to get station list: HTTP " + xhr.status));
                    }
                }
            };
            xhr.onerror = function() {
                reject(new Error("Network error getting station list"));
            };
            xhr.send();
        });
    },
    
    fetchOverviewData: function(stationDn) {
        var self = this;
        return new Promise(function(resolve, reject) {
            var url = "https://" + self.dataHost + "/rest/pvms/web/station/v2/overview/energy-flow";
            var xhr = new XMLHttpRequest();
            xhr.open("GET", url, true);
            xhr.setRequestHeader("Cookie", "dp-session=" + self.dpSession);
            xhr.setRequestHeader("CSRF", self.csrfToken);
            // Set parameters
            // We need to send stationDn as parameter? According to HA, it's in body? Actually they send as JSON? Let's check.
            // In HA they send as params: {stationDn: unquote(self.station)}
            // We'll try as query parameter for simplicity.
            var params = "?stationDn=" + encodeURIComponent(stationDn);
            xhr.open("GET", url + params, true);
            xhr.onreadystatechange = function() {
                if (xhr.readyState === XMLHttpRequest.DONE) {
                    if (xhr.status === 200) {
                        try {
                            var data = JSON.parse(xhr.responseText);
                            resolve(data);
                        } catch (e) {
                            reject(new Error("Invalid overview response"));
                        }
                    } else {
                        reject(new Error("Failed to get overview: HTTP " + xhr.status));
                    }
                }
            };
            xhr.onerror = function() {
                reject(new Error("Network error getting overview"));
            };
            xhr.send();
        });
    },
    
    parseOverviewData: function(data) {
        // Based on Home Assistant implementation
        var output = {
            power: null,
            soc: null,
            todayEnergy: null
        };
        if (!data || !data.data || !data.data.flow) {
            return output;
        }
        var flow = data.data.flow;
        var nodes = flow.nodes || [];
        var links = flow.links || [];
        
        // Node mapping
        var nodeMap = {
            "neteco.pvms.devTypeLangKey.string": "panel_production_power", // instant power
            "neteco.pvms.devTypeLangKey.energy_store": "battery_injection_power",
            "neteco.pvms.KPI.kpiView.electricalLoad": "house_load_power",
            "neteco.pvms.energy.flow.buy.power": "grid_consumption_power"
        };
        
        // Process nodes
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            var label = node.name || "";
            var valueNode = node.description || {};
            var valueStr = valueNode.value || "";
            var value = parseFloat(valueStr);
            if (isNaN(value)) value = 0;
            
            if (label === "neteco.pvms.devTypeLangKey.energy_store") {
                // Battery: get SOC from deviceTips.SOC
                var tips = node.deviceTips || {};
                var socStr = tips.SOC || "";
                var soc = parseFloat(socStr);
                if (!isNaN(soc)) {
                    output.soc = soc;
                }
                // Determine charge/discharge power
                var batteryPowerStr = tips.BATTERY_POWER || "";
                var batteryPower = parseFloat(batteryPowerStr);
                if (!isNaN(batteryPower) && batteryPower > 0) {
                    // Charging (injection)
                    if (nodeMap[label]) {
                        output.power = 0; // Not used? We'll use panel_production_power for instant power
                    }
                    // We'll set injection positive, consumption zero
                } else {
                    // Discharging or zero
                }
            } else if (nodeMap[label]) {
                var outKey = nodeMap[label];
                if (outKey === "panel_production_power") {
                    output.power = value;
                }
                // other outputs not needed for now
            }
        }
        
        // Process links for grid direction (import/export)
        for (var i = 0; i < links.length; i++) {
            var link = links[i];
            var label = (link.description || {}).label || "";
            var valueStr = (link.description || {}).value || "";
            var value = parseFloat(valueStr);
            if (isNaN(value)) value = 0;
            
            if (label === "neteco.pvms.energy.flow.buy.power") {
                // Determine direction based on other flows
                // Simplified: assume positive means consumption from grid
                // We'll just store absolute value; sign not needed for display
                // For simplicity, we ignore for now
            }
        }
        
        // Today energy: we need to fetch from energy balance? For simplicity, we can get from overview? 
        // In HA they use energy balance for today. We'll leave as null for now.
        // TODO: Implement today energy fetch via energy balance endpoint.
        
        return output;
    }
};

// Export for use in QML (if needed)
if (typeof module !== 'undefined') {
    module.exports = FusionSolar;
}