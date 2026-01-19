import { useState, useEffect, useMemo } from 'react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Checkbox } from '../components/ui/Checkbox';
import { AnalyzeMetadata } from '../../wailsjs/go/main/App';
import { Submission, HardwareTarget } from '../types';
import { Loader2, Search } from 'lucide-react';

interface MetadataStepProps {
    token: string;
    submission: Submission;
    onNext: (targets: HardwareTarget[]) => void;
}

export function MetadataStep({ token, submission, onNext }: MetadataStepProps) {
    const [targets, setTargets] = useState<HardwareTarget[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set()); // key: bundleId|infId|osCode|pnpId
    const [filter, setFilter] = useState('');

    useEffect(() => {
        AnalyzeMetadata(token, submission)
            .then((res: any) => {
                setTargets(res.targets || []);
            })
            .catch((e: any) => setError(e.toString()))
            .finally(() => setLoading(false));
    }, [token, submission]);

    const filtered = useMemo(() => {
        if (!filter) return targets;
        const low = filter.toLowerCase();
        return targets.filter(t =>
            t.infId.toLowerCase().includes(low) ||
            t.osCode.toLowerCase().includes(low) ||
            t.pnpId.toLowerCase().includes(low) ||
            t.bundleTag.toLowerCase().includes(low)
        );
    }, [targets, filter]);

    const getKey = (t: HardwareTarget) => `${t.bundleId}|${t.infId}|${t.osCode}|${t.pnpId}`;

    const toggle = (t: HardwareTarget) => {
        const key = getKey(t);
        const next = new Set(selected);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        setSelected(next);
    };

    const toggleAll = () => {
        if (selected.size === filtered.length) {
            setSelected(new Set());
        } else {
            const next = new Set<string>();
            filtered.forEach(t => next.add(getKey(t)));
            setSelected(next);
        }
    };

    const isAllSelected = filtered.length > 0 && selected.size === filtered.length;

    if (loading) return <div className="flex h-full items-center justify-center flex-col gap-4 text-muted-foreground"><Loader2 className="animate-spin" size={48} /><div>Analyzing Driver Metadata...</div></div>;
    if (error) return <div className="p-8 text-destructive bg-destructive/10 rounded m-4">{error}</div>;

    return (
        <div className="flex flex-col h-full overflow-hidden p-4 gap-4">
             <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Filter by INF, OS, PNP..."
                        className="pl-8"
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                    />
                </div>
                <div className="text-sm text-muted-foreground whitespace-nowrap">
                    {selected.size} selected / {filtered.length} visible
                </div>
                <Button onClick={() => onNext(targets.filter(t => selected.has(getKey(t))))} disabled={selected.size === 0}>
                    Next Step
                </Button>
            </div>

            <div className="flex-1 rounded-md border overflow-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 sticky top-0 z-10 backdrop-blur-sm shadow-sm">
                        <tr className="border-b">
                            <th className="h-10 px-4 w-[40px]">
                                <Checkbox checked={isAllSelected} onChange={toggleAll} />
                            </th>
                            <th className="h-10 px-4 font-medium text-muted-foreground w-[60px]">Tag</th>
                            <th className="h-10 px-4 font-medium text-muted-foreground">INF</th>
                            <th className="h-10 px-4 font-medium text-muted-foreground">OS</th>
                            <th className="h-10 px-4 font-medium text-muted-foreground">PNP</th>
                            <th className="h-10 px-4 font-medium text-muted-foreground">Desc</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {filtered.map((t) => {
                             const key = getKey(t);
                             const isSel = selected.has(key);
                             return (
                                <tr key={key} className={isSel ? "bg-primary/10 hover:bg-primary/20 cursor-pointer" : "hover:bg-muted/50 cursor-pointer"} onClick={() => toggle(t)}>
                                    <td className="p-4 py-2" onClick={e => e.stopPropagation()}>
                                        <Checkbox checked={isSel} onChange={() => toggle(t)} />
                                    </td>
                                    <td className="p-4 py-2 font-mono text-xs opacity-70">{t.bundleTag}</td>
                                    <td className="p-4 py-2 font-mono">{t.infId}</td>
                                    <td className="p-4 py-2">{t.osCode}</td>
                                    <td className="p-4 py-2 font-mono text-xs truncate max-w-[200px]" title={t.pnpId}>{t.pnpId}</td>
                                    <td className="p-4 py-2 text-xs text-muted-foreground truncate max-w-[200px]" title={t.deviceDescription}>{t.deviceDescription}</td>
                                </tr>
                             );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
