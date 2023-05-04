import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
export declare const track: (args?: {
    [key: string]: any;
}) => NodeTracerProvider;
