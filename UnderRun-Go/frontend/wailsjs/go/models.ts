export namespace services {
	
	export class URSnapshot {
	    a: number;
	    b: number;
	    c: number;
	    d: number;
	    valid: boolean;
	    ts: string;
	
	    static createFrom(source: any = {}) {
	        return new URSnapshot(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.a = source["a"];
	        this.b = source["b"];
	        this.c = source["c"];
	        this.d = source["d"];
	        this.valid = source["valid"];
	        this.ts = source["ts"];
	    }
	}

}

export namespace settings {
	
	export class Settings {
	    closeToTray: boolean;
	    alwaysOnTop: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.closeToTray = source["closeToTray"];
	        this.alwaysOnTop = source["alwaysOnTop"];
	    }
	}

}

