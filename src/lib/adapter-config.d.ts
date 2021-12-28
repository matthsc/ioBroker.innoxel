// This file extends the AdapterConfig type from "@types/iobroker"

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
    namespace ioBroker {
        interface AdapterConfig {
            ipaddress: string;
            port: number;
            username: string;
            password: string;
            weatherInterval: number;
            roomTemperatureInterval: number;
            deviceStatusInterval: number;
            changeInterval: number;
        }
    }
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};
