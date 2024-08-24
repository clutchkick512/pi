/*
 * View model for OctoPrint-BambuPrinter
 *
 * Author: jneilliii
 * License: AGPLv3
 */

$(function () {
    function Bambu_printerViewModel(parameters) {
        var self = this;

        self.settingsViewModel = parameters[0];
        self.filesViewModel = parameters[1];
        self.loginStateViewModel = parameters[2];
        self.accessViewModel = parameters[3];
        self.timelapseViewModel = parameters[4];

        self.getAuthToken = function (data) {
            self.settingsViewModel.settings.plugins.bambu_printer.auth_token("");
            OctoPrint.simpleApiCommand("bambu_printer", "register", {
                "email": self.settingsViewModel.settings.plugins.bambu_printer.email(),
                "password": $("#bambu_cloud_password").val(),
                "region": self.settingsViewModel.settings.plugins.bambu_printer.region(),
                "auth_token": self.settingsViewModel.settings.plugins.bambu_printer.auth_token()
            })
                .done(function (response) {
                    console.log(response);
                    self.settingsViewModel.settings.plugins.bambu_printer.auth_token(response.auth_token);
                    self.settingsViewModel.settings.plugins.bambu_printer.username(response.username);
                });
        };

                // initialize list helper
        self.listHelper = new ItemListHelper(
            "timelapseFiles",
            {
                name: function (a, b) {
                    // sorts ascending
                    if (a["name"].toLocaleLowerCase() < b["name"].toLocaleLowerCase())
                        return -1;
                    if (a["name"].toLocaleLowerCase() > b["name"].toLocaleLowerCase())
                        return 1;
                    return 0;
                },
                date: function (a, b) {
                    // sorts descending
                    if (a["date"] > b["date"]) return -1;
                    if (a["date"] < b["date"]) return 1;
                    return 0;
                },
                size: function (a, b) {
                    // sorts descending
                    if (a["bytes"] > b["bytes"]) return -1;
                    if (a["bytes"] < b["bytes"]) return 1;
                    return 0;
                }
            },
            {},
            "name",
            [],
            [],
            CONFIG_TIMELAPSEFILESPERPAGE
        );

        self.onDataUpdaterPluginMessage = function(plugin, data) {
            if (plugin != "bambu_printer") {
                return;
            }

            if (data.files !== undefined) {
                console.log(data.files);
                self.listHelper.updateItems(data.files);
                self.listHelper.resetPage();
            }
        };

        self.onBeforeBinding = function () {
            $('#bambu_timelapse').appendTo("#timelapse");
        };

        self.showTimelapseThumbnail = function(data) {
            $("#bambu_printer_timelapse_thumbnail").attr("src", data.thumbnail);
            $("#bambu_printer_timelapse_preview").modal('show');
        };

        /*$('#files div.upload-buttons > span.fileinput-button:first, #files div.folder-button').remove();
        $('#files div.upload-buttons > span.fileinput-button:first').removeClass('span6').addClass('input-block-level');

        self.onBeforePrintStart = function(start_print_command) {
            let confirmation_html = '' +
                '            <div class="row-fluid form-vertical">\n' +
                '                <div class="control-group">\n' +
                '                    <label class="control-label">' + gettext("Plate Number") + '</label>\n' +
                '                    <div class="controls">\n' +
                '                        <input type="number" min="1" value="1" id="bambu_printer_plate_number" class="input-mini">\n' +
                '                    </div>\n' +
                '                </div>\n' +
                '            </div>';

            if(!self.settingsViewModel.settings.plugins.bambu_printer.always_use_default_options()){
                confirmation_html += '\n' +
                    '            <div class="row-fluid">\n' +
                    '                <div class="span6">\n' +
                    '                    <label class="checkbox"><input id="bambu_printer_timelapse" type="checkbox"' + ((self.settingsViewModel.settings.plugins.bambu_printer.timelapse()) ? ' checked' : '') + '> ' + gettext("Enable timelapse") + '</label>\n' +
                    '                    <label class="checkbox"><input id="bambu_printer_bed_leveling" type="checkbox"' + ((self.settingsViewModel.settings.plugins.bambu_printer.bed_leveling()) ? ' checked' : '') + '> ' + gettext("Enable bed leveling") + '</label>\n' +
                    '                    <label class="checkbox"><input id="bambu_printer_flow_cali" type="checkbox"' + ((self.settingsViewModel.settings.plugins.bambu_printer.flow_cali()) ? ' checked' : '') + '> ' + gettext("Enable flow calibration") + '</label>\n' +
                    '                </div>\n' +
                    '                <div class="span6">\n' +
                    '                    <label class="checkbox"><input id="bambu_printer_vibration_cali" type="checkbox"' + ((self.settingsViewModel.settings.plugins.bambu_printer.vibration_cali()) ? ' checked' : '') + '> ' + gettext("Enable vibration calibration") + '</label>\n' +
                    '                    <label class="checkbox"><input id="bambu_printer_layer_inspect" type="checkbox"' + ((self.settingsViewModel.settings.plugins.bambu_printer.layer_inspect()) ? ' checked' : '') + '> ' + gettext("Enable first layer inspection") + '</label>\n' +
                    '                    <label class="checkbox"><input id="bambu_printer_use_ams" type="checkbox"' + ((self.settingsViewModel.settings.plugins.bambu_printer.use_ams()) ? ' checked' : '') + '> ' + gettext("Use AMS") + '</label>\n' +
                    '                </div>\n' +
                    '            </div>\n';
            }

            showConfirmationDialog({
                title: "Bambu Print Options",
                html: confirmation_html,
                cancel: gettext("Cancel"),
                proceed: [gettext("Print"), gettext("Always")],
                onproceed: function (idx) {
                    if(idx === 1){
                        self.settingsViewModel.settings.plugins.bambu_printer.timelapse($('#bambu_printer_timelapse').is(':checked'));
                        self.settingsViewModel.settings.plugins.bambu_printer.bed_leveling($('#bambu_printer_bed_leveling').is(':checked'));
                        self.settingsViewModel.settings.plugins.bambu_printer.flow_cali($('#bambu_printer_flow_cali').is(':checked'));
                        self.settingsViewModel.settings.plugins.bambu_printer.vibration_cali($('#bambu_printer_vibration_cali').is(':checked'));
                        self.settingsViewModel.settings.plugins.bambu_printer.layer_inspect($('#bambu_printer_layer_inspect').is(':checked'));
                        self.settingsViewModel.settings.plugins.bambu_printer.use_ams($('#bambu_printer_use_ams').is(':checked'));
                        self.settingsViewModel.settings.plugins.bambu_printer.always_use_default_options(true);
                        self.settingsViewModel.saveData();
                    }
                    // replace this with our own print command API call?
                    start_print_command();
                },
                nofade: true
            });
            return false;
        };*/
    }

    OCTOPRINT_VIEWMODELS.push({
        construct: Bambu_printerViewModel,
        // ViewModels your plugin depends on, e.g. loginStateViewModel, settingsViewModel, ...
        dependencies: ["settingsViewModel", "filesViewModel", "loginStateViewModel", "accessViewModel", "timelapseViewModel"],
        // Elements to bind to, e.g. #settings_plugin_bambu_printer, #tab_plugin_bambu_printer, ...
        elements: ["#bambu_printer_print_options", "#settings_plugin_bambu_printer", "#bambu_timelapse"]
    });
});
