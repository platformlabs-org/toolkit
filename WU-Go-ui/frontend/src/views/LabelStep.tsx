import { useState } from 'react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { CreateShippingLabel } from '../../wailsjs/go/main/App';
import { Submission, HardwareTarget, LabelOptions, Credential } from '../types';
import { Check, Copy } from 'lucide-react';

interface LabelStepProps {
    token: string;
    submission: Submission;
    targets: HardwareTarget[];
    config: Credential;
}

export function LabelStep({ token, submission, targets, config }: LabelStepProps) {
    const [name, setName] = useState('');
    const [chids, setChids] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState('');

    const handleCreate = async () => {
        if(!name || !chids) return;
        setLoading(true);
        setError('');

        // Prepare options (using defaults + config)
        const opts: LabelOptions = {
            destination: "windowsUpdate",
            goLiveImmediate: true,
            goLiveDate: "",
            visibleToAccounts: [],
            autoInstallDuringOSUpgrade: true,
            autoInstallOnApplicableSystems: true,
            isDisclosureRestricted: false,
            publishToWindows10s: false,

            msContact: config.MsContact || "feizh@microsoft.com",
            validationsPerformed: config.ValidationsPerformed || "Product assurance team full range tested",
            affectedOems: config.AffectedOems || ["N/A"],
            isRebootRequired: false,
            isCoEngineered: false,
            isForUnreleasedHardware: false,
            hasUiSoftware: false,
            businessJustification: config.BusinessJustification || "to meet MDA requirements"
        };

        const chidList = chids.split(',').map(s => s.trim()).filter(Boolean);

        try {
            const res = await CreateShippingLabel(
                token,
                submission.productId,
                submission.id,
                opts,
                name,
                targets,
                chidList
            );
            setResult(res);
        } catch (e: any) {
            setError(e.toString());
        } finally {
            setLoading(false);
        }
    };

    if (result) {
        const shippingLabelId = result.id;
        const link = `https://partner.microsoft.com/en-us/dashboard/hardware/driver/${submission.productId}/submission/${submission.id}/ShippingLabel/${shippingLabelId}`;

        return (
            <div className="flex justify-center items-center h-full">
                <Card className="w-[500px] border-green-600/50 bg-green-500/10">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-green-500">
                            <Check /> Success
                        </CardTitle>
                        <CardDescription className="text-green-500/80">Shipping Label Created Successfully.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Label ID</Label>
                            <div className="font-mono bg-background p-2 rounded border">{shippingLabelId}</div>
                        </div>
                        <div className="space-y-2">
                            <Label>Link</Label>
                            <div className="flex gap-2">
                                <Input value={link} readOnly className="font-mono text-xs" />
                                <Button variant="outline" size="icon" onClick={() => navigator.clipboard.writeText(link)}>
                                    <Copy size={16} />
                                </Button>
                            </div>
                        </div>
                        <Button className="w-full mt-4" onClick={() => window.location.reload()}>Start Over</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="flex justify-center items-center h-full">
            <Card className="w-[500px]">
                <CardHeader>
                    <CardTitle>Create Shipping Label</CardTitle>
                    <CardDescription>
                        Creating label for <strong>{targets.length}</strong> hardware targets.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label>Label Name</Label>
                        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Dell: Mouse Driver v1.0" />
                    </div>
                    <div className="space-y-2">
                        <Label>CHIDs (comma separated)</Label>
                        <Input value={chids} onChange={e => setChids(e.target.value)} placeholder="{GUID}, {GUID}" />
                        <p className="text-xs text-muted-foreground">Enter CHIDs to target.</p>
                    </div>

                    {error && <div className="text-destructive text-sm bg-destructive/10 p-2 rounded">{error}</div>}

                    <Button className="w-full" onClick={handleCreate} isLoading={loading} disabled={!name || !chids}>
                        Create Label
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
