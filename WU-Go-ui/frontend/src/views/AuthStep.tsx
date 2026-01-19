import { useState, useEffect } from 'react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { LoadConfig, SaveConfig, AcquireToken } from '../../wailsjs/go/main/App';
import { Credential } from '../types';

interface AuthStepProps {
    onNext: (token: string, config: Credential) => void;
}

export function AuthStep({ onNext }: AuthStepProps) {
    const [cred, setCred] = useState<Credential>({
        TenantId: '', ClientId: '', ClientSecret: '',
        MsContact: '', ValidationsPerformed: '', AffectedOems: [], BusinessJustification: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        LoadConfig().then((c: any) => {
            if (c) setCred(prev => ({...prev, ...c}));
        }).catch(console.error);
    }, []);

    const handleLogin = async () => {
        setLoading(true);
        setError('');
        try {
            const token = await AcquireToken(cred.TenantId, cred.ClientId, cred.ClientSecret);
            await SaveConfig(cred);
            onNext(token, cred);
        } catch (e: any) {
            setError(e.toString());
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex justify-center items-center h-full">
            <Card className="w-[450px]">
                <CardHeader>
                    <CardTitle>Authentication</CardTitle>
                    <CardDescription>Enter your Microsoft Hardware API credentials.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label>Tenant ID</Label>
                        <Input value={cred.TenantId} onChange={e => setCred({...cred, TenantId: e.target.value})} placeholder="00000000-0000-..." />
                    </div>
                    <div className="space-y-2">
                        <Label>Client ID</Label>
                        <Input value={cred.ClientId} onChange={e => setCred({...cred, ClientId: e.target.value})} placeholder="00000000-0000-..." />
                    </div>
                    <div className="space-y-2">
                        <Label>Client Secret</Label>
                        <Input type="password" value={cred.ClientSecret} onChange={e => setCred({...cred, ClientSecret: e.target.value})} />
                    </div>

                    {error && <div className="text-destructive text-sm bg-destructive/10 p-2 rounded">{error}</div>}

                    <Button className="w-full" onClick={handleLogin} isLoading={loading}>
                        Connect
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
