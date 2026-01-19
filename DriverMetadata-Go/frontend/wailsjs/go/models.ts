export namespace sysdriver {
	
	export class DriverInfo {
	    deviceName: string;
	    version: string;
	    manufacturer: string;
	    infName: string;
	    catalogPath: string;
	    pnpDeviceId: string;
	    signedDriverHardwareId: string;
	    hardwareIds: string[];
	    compatibleIds: string[];
	    rawMatchedHardwareId: string;
	    displayMatchedHardwareId: string;
	    metadata: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new DriverInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.deviceName = source["deviceName"];
	        this.version = source["version"];
	        this.manufacturer = source["manufacturer"];
	        this.infName = source["infName"];
	        this.catalogPath = source["catalogPath"];
	        this.pnpDeviceId = source["pnpDeviceId"];
	        this.signedDriverHardwareId = source["signedDriverHardwareId"];
	        this.hardwareIds = source["hardwareIds"];
	        this.compatibleIds = source["compatibleIds"];
	        this.rawMatchedHardwareId = source["rawMatchedHardwareId"];
	        this.displayMatchedHardwareId = source["displayMatchedHardwareId"];
	        this.metadata = source["metadata"];
	    }
	}

}

