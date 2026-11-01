export declare const LOCAL_JWT_SECRET: string;
export declare const LOCAL_AUTH_URL: string;
export declare function signLocalJwt(role: string, ttlSeconds?: number): string;
