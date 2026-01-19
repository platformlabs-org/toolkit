import { TitleBar } from './TitleBar';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
        <TitleBar />
        <div className="flex-1 overflow-auto flex flex-col">
            {children}
        </div>
    </div>
  )
}
