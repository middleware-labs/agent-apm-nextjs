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

// Import new modules
const { addVCSMetadata, getEnvironmentVCSData } = require('./lib/vcs-helper');
const { initializeNextJSExceptionHandling, handleManualException } = require('./lib/nextjs-exception-handler');
const { getPackageVersion } = require('./lib/utils');

module.exports.track = async (args = {}) => {

    /*if (process.env.NEXT_RUNTIME !== 'nodejs') {
        return;
    }*/
    const constants = {
        mwAuthUrl: 'https://app.middleware.io/api/v1/auth',
    };

    const config = {
        hostUrl: 'http://localhost:9319',
        projectName: `Project-${process.pid}`,
        serviceName: `Service-${process.pid}`,
        accessToken: '',
        profilingServerUrl: '',
        target: '',
        envVercelDeploymentId: process.env.VERCEL_DEPLOYMENT_ID || '',
        envVercelProjectId: process.env.VERCEL_PROJECT_ID || '',
        envVercelEnv: process.env.VERCEL_ENV || '',
        envVercelUrl: process.env.VERCEL_URL || '',
        envVercelRegion: process.env.VERCEL_REGION || '',
        enableExceptionHandling: true, // Enable by default
        appVersion: process.env.MW_APP_VERSION || 'latest',
        ...args,
    };

    const mwApiKey = process.env.MW_ACCESS_TOKEN || '';
    
    if (mwApiKey) 
        config.accessToken = mwApiKey;
    else if (args.hasOwnProperty('accountKey') && args.accountKey !== '')
        config.accessToken = args.accountKey;

    if (process.env.MW_CUSTOM_RESOURCE_ATTRIBUTES && process.env.MW_CUSTOM_RESOURCE_ATTRIBUTES !== '') {
        try {
            const customAttributes = process.env.MW_CUSTOM_RESOURCE_ATTRIBUTES.split(',').reduce((acc, attr) => {
                const [key, value] = attr.split('=');
                if (key && value) {
                    acc[key.trim()] = value.trim();
                }
                return acc;
            }, {});
            config.customResourceAttributes = customAttributes;
        } catch (e) {
            console.error('Error parsing MW_CUSTOM_RESOURCE_ATTRIBUTES:', e);
            config.customResourceAttributes = {};
        }
    } else {
        config.customResourceAttributes = {};
    }

    const _resourceAttributes = {
        [SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
        'mw_agent': true,
        "channel": "vercel",
        'mw_serverless': config.target !== "",
        'project.name': config.projectName,
        'mw.app.lang': 'nextjs',
        'mw.sdk.version': getPackageVersion(),
        ...(config.envVercelDeploymentId && {'deploymentId': config.envVercelDeploymentId}),
        ...(config.envVercelProjectId && {'projectId': config.envVercelProjectId}),
        ...(config.envVercelEnv && {'environment': config.envVercelEnv}),
        ...(config.envVercelUrl && {'host': config.envVercelUrl}),
        ...(config.envVercelRegion && {'region': config.envVercelRegion}),
        ...(config.customResourceAttributes && typeof config.customResourceAttributes === 'object' ? config.customResourceAttributes : {}),
    };

    // Add environment-specific VCS data
    const envVCSData = getEnvironmentVCSData();
    Object.assign(_resourceAttributes, envVCSData);

    // Add VCS metadata from Git repository
    await addVCSMetadata(_resourceAttributes);

    if (config.target !== "") {
        config.hostUrl = config.target;
    }

    if (!!(process.env.MW_AGENT_SERVICE && process.env.MW_AGENT_SERVICE !== "")) {
        config.hostUrl = `http://${process.env.MW_AGENT_SERVICE}:9319`;
    }

    const _hostUrl = ((config.target).toLowerCase() === 'vercel') ? {} : {url: `${config.hostUrl}`};

    await setupTracer(_hostUrl, _resourceAttributes, config);
    setupLogger(_hostUrl, _resourceAttributes);
    
    // Initialize exception handling
    if (config.enableExceptionHandling) {
        initializeNextJSExceptionHandling(config);
    }
    
    setupProfiling({
        authUrl: constants.mwAuthUrl,
        profilingServerUrl: config.profilingServerUrl,
        accessToken: config.accessToken,
        serviceName: config.serviceName,
    }).then(() => {});
};

const setupTracer = async (hostUrl, resourceAttributes, config) => {
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
        traceExporter: new OTLPTraceExporter({...hostUrl, Authorization: config.accessToken}),
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
        resource: new Resource(resourceAttributes),
    });
    
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
    const logger = logs.getLogger("@middleware.io/agent-apm-nextjs", "latest");

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

// Add manual exception handling method
module.exports.captureException = (error, attributes = {}) => {
    // Log the error
    logger('ERROR', error.message, {
        ...attributes,
        'exception.type': error.constructor.name,
        'exception.message': error.message,
        'exception.stacktrace': error.stack,
    });
    
    // Handle the exception with full context
    handleManualException(error);
};

// Export wrapper functions for user convenience
module.exports.wrapAPIHandler = require('./lib/nextjs-exception-handler').wrapNextJSAPIHandler;
module.exports.wrapMiddleware = require('./lib/nextjs-exception-handler').wrapNextJSMiddleware;
module.exports.wrapServerComponent = require('./lib/nextjs-exception-handler').wrapNextJSServerComponent;

const setupProfiling = async (obj) => {
    if (obj.accessToken !== '') {
        try {
            let Pyroscope;
            try {
                Pyroscope = require('@pyroscope/nodejs');
            } catch (err) {
                console.log('Pyroscope is not installed. Skipping profiling setup.');
                return;
            }

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

                        let profilingServerUrl = obj.profilingServerUrl;
                        if (!profilingServerUrl) {
                            profilingServerUrl = process.env.MW_PROFILING_SERVER_URL || `https://${account}.middleware.io/profiling`;
                        }

                        Pyroscope.init({
                            serverAddress: profilingServerUrl,
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
