declare global {
    namespace ioBroker {
        interface AdapterConfig {
            host: string;
            port: number;
            serial: string;
            pollInterval: number;
            reconnectInterval: number;
        }
    }
}

export {};
