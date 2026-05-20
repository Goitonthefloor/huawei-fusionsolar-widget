// FusionSolar API Logic for Huawei FusionSolar Widget
// Uses jsrsasign (loaded globally as jsrsasign)

// Configuration will be set on window.FusionSolar by QML before calling loginAndFetch

window.FusionSolar = window.FusionSolar || {};

// Helper: sleep
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Main class/object
FusionSolar.Api = {
    host: "",
    username: "",
    password: "",
    stationDn: "", // optional

    connected: false,
    dpSession: "",
    dataHost: "",
    csrfToken: "",

    // Entry point called from QML
    loginAndFetch: function() {
        var self = this;
        return self.getPublicKey()
            .then(function(pubKeyInfo) { return self.login(pubKeyInfo); })
            .then(function(loginResult) {
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
                // For today's energy we need to call energy balance; we'll implement later
                // For now we leave todayEnergy as null; can be fetched separately.
                // We'll attempt to fetch today's energy in parallel or sequentially.
                // For simplicity, we fetch today's energy after overview.
                return self.fetchTodayEnergy().then(function(todayEnergy) {
                    result.todayEnergy = todayEnergy;
                    return result;
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
            xhr.onerror = function() { reject(new Error("Network error getting public key")); };
            xhr.send();
        });
    },

    // Step 2: Login with RSA encryption
    login: function(pubKeyInfo) {
        var self = this;
        return new Promise(function(resolve, reject) {
            // Encrypt password using RSA OAEP with SHA-384 via jsrsasign
            try {
                // Convert PEM to RSAKey object
                var rsaKey = jsrsasign.KEYUTIL.getKey(pubKeyInfo.pubKey);
                // Encrypt password (OAEP with SHA-384)
                var encrypted = jsrsasign.KJUR.crypto.Cipher.encrypt(
                    self.password,
                    rsaKey,
                    "rsaesoaep",
                    { hash: "sha384" }
                );
                // Append version as in HA integration
                var encryptedPassword = encrypted + pubKeyInfo.version;
            } catch (e) {
                reject(new Error("RSA encryption failed: " + e));
                return;
            }

            var payload = {
                organizationName: "",
                username: self.username,
                password: encryptedPassword,
                multiRegionName: ""
            };

            var loginUrl = "https://" + self.host + "/unisso/v3/validateUser.action";
            var xhr = new XMLHttpRequest();
            xhr.open("POST", loginUrl, true);
            xhr.setRequestHeader("Content-Type", "application/json");
            xhr.setRequestHeader("Accept", "application/json");
            // Referer header needed
            xhr.setRequestHeader("Referer", "https://" + self.host + "/unisso/login.action");
            xhr.onreadystatechange = function() {
                if (xhr.readyState === XMLHttpRequest.DONE) {
                    if (xhr.status === 200) {
                        try {
                            var data = JSON.parse(xhr.responseText);
                            // Extract redirect URL
                            var redirectUrl = null;
                            if (data && data.redirectUrl) {
                                redirectUrl = data.redirectUrl;
                            } else if (data && data.location) {
                                redirectUrl = data.location;
                            }
                            if (!redirectUrl) {
                                reject(new Error("No redirect URL in login response"));
                                return;
                            }
                            // Follow redirect to get session and data host
                            self.followRedirect(redirectUrl, function(err, sessionInfo) {
                                if (err) { reject(err); return; }
                                self.dpSession = sessionInfo.dpSession;
                                self.dataHost = sessionInfo.dataHost;
                                self.csrfToken = sessionInfo.csrfToken;
                                resolve({dpSession: self.dpSession, dataHost: self.dataHost, csrfToken: self.csrfToken});
                            });
                        } catch (e) {
                            reject(new Error("Invalid login response: " + e));
                        }
                    } else {
                        reject(new Error("Login failed: HTTP " + xhr.status));
                    }
                }
            };
            xhr.onerror = function() { reject(new Error("Network error during login")); };
            xhr.send(JSON.stringify(payload));
        });
    },

    // Follow redirect (302) to get dp-session cookie and data host
    followRedirect: function(redirectUrl, callback) {
        var self = this;
        var xhr = new XMLHttpRequest();
        xhr.open("GET", redirectUrl, true);
        // We need to allow redirects? We'll handle manually.
        xhr.onreadystatechange = function() {
            if (xhr.readyState === XMLHttpRequest.DONE) {
                if (xhr.status === 200 || xhr.status === 302) {
                    // Get cookies
                    var cookieHeader = xhr.getResponseHeader("Set-Cookie") || "";
                    var dpSession = "";
                    var matches = cookieHeader.match(/dp-session=([^;]+)/);
                    if (matches) dpSession = matches[1];
                    // Also check Location header for data host
                    var location = xhr.getResponseHeader("Location") || "";
                    var dataHost = self.login_host; // fallback
                    if (location) {
                        try {
                            var url = new URL(location);
                            dataHost = url.hostname;
                        } catch(e) {}
                    }
                    // CSRF token may be in response body or we need to fetch later; we'll fetch it later via a request to get csrf.
                    // For simplicity, we set csrf token empty and will refresh later.
                    callback(null, {dpSession: dpSession, dataHost: dataHost, csrfToken: ""});
                } else {
                    callback(new Error("Redirect failed: HTTP " + xhr.status), null);
                }
            }
        };
        xhr.onerror = function() { callback(new Error("Network error following redirect"), null); };
        xhr.send();
    },

    // Get station list
    getStationList: function() {
        var self = this;
        return new Promise(function(resolve, reject) {
            var url = "https://" + self.dataHost + "/rest/pvms/web/station/v1/station/station-list";
            var xhr = new XMLHttpRequest();
            xhr.open("GET", url, true);
            xhr.setRequestHeader("Cookie", "dp-session=" + self.dpSession);
            if (self.csrfToken) {
                xhr.setRequestHeader("CSRF", self.csrfToken);
            }
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
            xhr.onerror = function() { reject(new Error("Network error getting station list")); };
            xhr.send();
        });
    },

    // Fetch overview data (real-time power flow)
    fetchOverviewData: function(stationDn) {
        var self = this;
        return new Promise(function(resolve, reject) {
            var url = "https://" + self.dataHost + "/rest/pvms/web/station/v2/overview/energy-flow";
            var xhr = new XMLHttpRequest();
            xhr.open("GET", url, true);
            // Parameters: stationDn
            var params = "?stationDn=" + encodeURIComponent(stationDn);
            xhr.open("GET", url + params, true);
            xhr.setRequestHeader("Cookie", "dp-session=" + self.dpSession);
            if (self.csrfToken) {
                xhr.setRequestHeader("CSRF", self.csrfToken);
            }
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
            xhr.onerror = function() { reject(new Error("Network error getting overview")); };
            xhr.send();
        });
    },

    // Parse overview data to extract instant power and battery SOC
    parseOverviewData: function(data) {
        var output = {
            power: null,   // instantaneous power in W
            soc: null,     // battery percentage
            todayEnergy: null // to be filled later
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
            var desc = node.description || {};
            var valueStr = desc.value || "";
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
                // Determine charge/discharge power (we may not need)
                // We'll ignore for now.
            } else if (nodeMap[label]) {
                var outKey = nodeMap[label];
                if (outKey === "panel_production_power") {
                    output.power = value;
                }
                // other outputs not needed for now
            }
        }

        // Process links for grid direction (optional)
        // We'll skip for simplicity.

        return output;
    },

    // Fetch today's energy (kWh) from energy balance endpoint
    fetchTodayEnergy: function() {
        var self = this;
        return new Promise(function(resolve, reject) {
            // We need to call energy balance with call_type = DAY (2) and specific date = today (or use DAY without specific date?)
            // According to HA, they use get_week_data and then extract today from week_data.
            // For simplicity, we call energy balance with call_type = DAY and no specific date (should return today?)
            // The endpoint: /rest/pvms/web/station/v2/overview/energy-balance
            // Parameters: stationDn, timeDim=2, queryTime=timestamp of today start, timeZone=0, timeZoneStr=Europe/London?, dateStr, _=now
            // We'll approximate: use start of day timestamp.
            var now = new Date();
            var startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            var timestamp = startOfDay.getTime(); // milliseconds
            var dateStr = startOfDay.toISOString().slice(0,10) + " 00:00:00"; // YYYY-MM-DD HH:MM:SS

            var url = "https://" + self.dataHost + "/rest/pvms/web/station/v2/overview/energy-balance";
            var params = "?stationDn=" + encodeURIComponent(self.stationDn) +
                        "&timeDim=2" + // DAY
                        "&queryTime=" + timestamp +
                        "&timeZone=0.0" +
                        "&timeZoneStr=Europe/London" +
                        "&dateStr=" + encodeURIComponent(dateStr) +
                        "&_=" + Date.now();
            var xhr = new XMLHttpRequest();
            xhr.open("GET", url + params, true);
            xhr.setRequestHeader("Cookie", "dp-session=" + self.dpSession);
            if (self.csrfToken) {
                xhr.setRequestHeader("CSRF", self.csrfToken);
            }
            xhr.onreadystatechange = function() {
                if (xhr.readyState === XMLHttpRequest.DONE) {
                    if (xhr.status === 200) {
                        try {
                            var data = JSON.parse(xhr.responseText);
                            // Extract today's energy: field totalProductPower? Actually for today energy we need panel_production_today.
                            // In HA they use month_data and then extract day offset.
                            // Let's try to get totalProductPower (which is production for the period) for day.
                            // The structure: data.data.totalProductPower (string maybe)
                            var todayEnergyStr = data.data ? data.data.totalProductPower : null;
                            var todayEnergy = null;
                            if (todayEnergyStr) {
                                var val = parseFloat(todayEnergyStr);
                                if (!isNaN(val)) {
                                    todayEnergy = val; // assuming kWh
                                }
                            }
                            resolve(todayEnergy);
                        } catch (e) {
                            // If fails, resolve null (we'll keep null)
                            resolve(null);
                        }
                    } else {
                        resolve(null); // on error, just null
                    }
                }
            };
            xhr.onerror = function() { resolve(null); };
            xhr.send();
        });
    }
};