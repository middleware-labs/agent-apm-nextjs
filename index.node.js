'use strict';
const { NodeSDK } = require("@opentelemetry/sdk-node");
const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-grpc");
const { Resource } = require("@opentelemetry/resources");
const { SemanticResourceAttributes } = require("@opentelemetry/semantic-conventions");
const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node");
const { GrpcInstrumentation } = require("@opentelemetry/instrumentation-grpc");

const { logs, SeverityNumber } = require('@opentelemetry/api-logs');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-grpc');
const { LoggerProvider, SimpleLogRecordProcessor } = require('@opentelemetry/sdk-logs');

const fs = require('fs');
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

module.exports.track = (args = {}) => {

    /*if (process.env.NEXT_RUNTIME !== 'nodejs') {
        return;
    }*/
    const constants = {
        mwAuthUrl: 'https://app.middleware.io/api/v1/auth',
        profilingServerUrl: 'https://profiling.middleware.io',
    };

    const config = {
        hostUrl: 'http://localhost:9319',
        projectName: `Project-${process.pid}`,
        serviceName: `Service-${process.pid}`,
        accessToken: '',
        target: '',
        ...args,
    };

    // For backward compatibility
    if (args.hasOwnProperty('accountKey') && args.accountKey !== '') {
        config.accessToken = args.accountKey;
    }

    const _resourceAttributes = {
        [SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
        'mw_agent': true,
        'project.name': config.projectName,
        ...(config.accessToken && {'mw.account_key': config.accessToken}),
        ...(config.accessToken && {'accessToken': config.accessToken}),
    };

    if (config.target !== "") {
        config.hostUrl = config.target;
    }

    if (!!(process.env.MW_AGENT_SERVICE && process.env.MW_AGENT_SERVICE !== "")) {
        config.hostUrl = `http://${process.env.MW_AGENT_SERVICE}:9319`;
    }

    const _hostUrl = ((config.target).toLowerCase() === 'vercel') ? {} : {url: `${config.hostUrl}`};

    setupTracer(_hostUrl, _resourceAttributes);
    setupLogger(_hostUrl, _resourceAttributes);
    setupProfiling({
        authUrl: constants.mwAuthUrl,
        profilingServerUrl: constants.profilingServerUrl,
        accessToken: config.accessToken,
        serviceName: config.serviceName
    }).then(() => {});
};

const setupTracer = (hostUrl, resourceAttributes) => {
    const api = require('@opentelemetry/api');
    const { CompositePropagator } = require('@opentelemetry/core');
    const { B3Propagator, B3InjectEncoding } = require('@opentelemetry/propagator-b3');
    api.propagation.setGlobalPropagator(
        new CompositePropagator({
            propagators: [
                new B3Propagator(),
                new B3Propagator({ injectEncoding: B3InjectEncoding.MULTI_HEADER }),
            ],
        })
    );

    const sdk = new NodeSDK({
        traceExporter: new OTLPTraceExporter(hostUrl),
        instrumentations: [
            getNodeAutoInstrumentations({
                '@opentelemetry/instrumentation-fs': {
                    enabled: false,
                },
            }),
            new GrpcInstrumentation({
                ignoreGrpcMethods:["Export"]
            })
        ],
    });
    sdk.addResource(new Resource(resourceAttributes));
    sdk.start();

    process.on('SIGTERM', () => {
        sdk.shutdown()
            .catch(error => console.log('Error terminating tracing', error))
            .finally(() => process.exit(0));
    });
};

const setupLogger = (hostUrl, resourceAttributes) => {
    const loggerProvider = new LoggerProvider({
        resource: new Resource(resourceAttributes)
    });

    loggerProvider.addLogRecordProcessor(
        new SimpleLogRecordProcessor(new OTLPLogExporter(hostUrl)),
    );
    logs.setGlobalLoggerProvider(loggerProvider);
};

const logger = (level, message, attributes = {}) => {
    const logger = logs.getLogger(packageJson.name, packageJson.version);

    logger.emit({
        severityNumber: SeverityNumber[level],
        severityText: level,
        body: message,
        attributes: {
            'fluent.tag': 'nextjs.app',
            'mw.app.lang': 'nextjs',
            'level': level.toLowerCase(),
            ...(typeof attributes === 'object' && Object.keys(attributes).length ? attributes : {})
        },
    });
};

module.exports.info = (message, attributes = {}) => {
    logger('INFO', message, attributes);
};

module.exports.warn = (message, attributes = {}) => {
    logger('WARN', message, attributes);
};

module.exports.debug = (message, attributes = {}) => {
    logger('DEBUG', message, attributes);
};

module.exports.error = (message, attributes = {}) => {
    logger('ERROR', message, attributes);
};

const setupProfiling = async (obj) => {
    if (obj.accessToken !== '') {
        try {
            const Pyroscope = require('@pyroscope/nodejs');
            const axios = require('axios');

            const authUrl = process.env.MW_AUTH_URL || obj.authUrl;

            const response = await axios.post(authUrl, null, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Bearer ' + obj.accessToken,
                },
            });

            if (response.status === 200) {
                const data = response.data;
                if (data.hasOwnProperty('success') && data.success === true) {
                    const account = data.data.account;
                    if (data.hasOwnProperty('data')
                        && data.data.hasOwnProperty('account')
                        && typeof data.data.account === 'string') {

                        Pyroscope.init({
                            serverAddress: process.env.MW_PROFILING_SERVER_URL || obj.profilingServerUrl,
                            appName: obj.serviceName,
                            tenantID: account,
                        });

                        Pyroscope.start();
                    } else {
                        console.log('Failed to retrieve TenantID from API response');
                    }
                } else {
                    console.log('Failed to authenticate with Middleware API, kindly check your access token');
                }
            } else {
                console.log('Error making auth request');
            }

        } catch (e) {
            console.log('Error starting profiling:', e.message);
        }
    }
};
