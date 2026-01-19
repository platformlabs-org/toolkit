import { Minus, X } from 'lucide-react';
import { WindowMinimise, Quit } from '../../wailsjs/runtime';

export function TitleBar() {
  return (
    <div className="h-9 flex items-center justify-between bg-white border-b border-gray-200 select-none z-50">
        <div className="flex-1 h-full flex items-center px-4 text-xs font-bold tracking-wide text-gray-500 uppercase" style={{ "--wails-draggable": "drag" } as any}>
            WU Shipping Tool
        </div>
        <div className="flex h-full">
            <button onClick={WindowMinimise} className="h-full px-4 hover:bg-gray-100 transition-colors text-gray-500 hover:text-black">
                <Minus size={16} />
            </button>
            <button onClick={Quit} className="h-full px-4 hover:bg-red-500 hover:text-white transition-colors text-gray-500">
                <X size={16} />
            </button>
        </div>
    </div>
  )
}
