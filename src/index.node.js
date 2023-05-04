'use strict';
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.track = void 0;
var resources_1 = require("@opentelemetry/resources");
var semantic_conventions_1 = require("@opentelemetry/semantic-conventions");
var sdk_trace_node_1 = require("@opentelemetry/sdk-trace-node");
var exporter_trace_otlp_http_1 = require("@opentelemetry/exporter-trace-otlp-http");
var process = require("process");
var track = function (args) {
    var _a;
    if (args === void 0) { args = {}; }
    if (process.env.NEXT_RUNTIME !== 'nodejs') {
        return;
    }
    var config = __assign({ hostUrl: 'http://localhost:9320', projectName: "Project-" + process.pid, serviceName: "Service-" + process.pid, accountKey: "", target: "" }, args);
    var resourceAttributes = __assign((_a = {}, _a[semantic_conventions_1.SemanticResourceAttributes.SERVICE_NAME] = config.serviceName, _a['mw_agent'] = true, _a['project.name'] = config.projectName, _a), (config.accountKey !== "" && { 'mw.account_key': config.accountKey }));
    if (config.target !== "") {
        config.hostUrl = config.target;
    }
    if (!!(process.env.MW_AGENT_SERVICE && process.env.MW_AGENT_SERVICE !== "")) {
        config.hostUrl = "http://".concat(process.env.MW_AGENT_SERVICE, ":9320");
    }
    var configUrl = ((config.target).toLowerCase() === "vercel") ? {} : { url: "".concat(config.hostUrl, "/v1/traces") };
    var provider = new sdk_trace_node_1.NodeTracerProvider({
        resource: new resources_1.Resource(resourceAttributes),
    });
    provider.register();
    provider.addSpanProcessor(new sdk_trace_node_1.SimpleSpanProcessor(new exporter_trace_otlp_http_1.OTLPTraceExporter(configUrl)));
    return provider;
};
exports.track = track;
