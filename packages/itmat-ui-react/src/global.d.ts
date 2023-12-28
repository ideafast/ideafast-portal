declare global {
    interface Window {
        onUploadProgressHackMap?: Record<string, (progressEvent: any) => void>;
    }
}
