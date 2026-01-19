import { Minus, X } from 'lucide-react';
import { WindowMinimise, Quit } from '../../wailsjs/runtime';

export function TitleBar() {
  return (
    <div className="h-9 flex items-center justify-between bg-secondary/30 border-b border-border select-none">
        <div className="flex-1 h-full flex items-center px-4 text-xs font-bold tracking-wide text-muted-foreground uppercase" style={{ "--wails-draggable": "drag" } as any}>
            WU Shipping Tool
        </div>
        <div className="flex h-full">
            <button onClick={WindowMinimise} className="h-full px-4 hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                <Minus size={16} />
            </button>
            <button onClick={Quit} className="h-full px-4 hover:bg-destructive hover:text-destructive-foreground transition-colors text-muted-foreground">
                <X size={16} />
            </button>
        </div>
    </div>
  )
}
