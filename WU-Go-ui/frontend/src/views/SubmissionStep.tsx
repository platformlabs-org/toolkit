import { useState } from 'react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '../components/ui/Card';
import { GetSubmission } from '../../wailsjs/go/main/App';
import { Submission } from '../types';

interface SubmissionStepProps {
    token: string;
    onNext: (submission: Submission) => void;
}

export function SubmissionStep({ token, onNext }: SubmissionStepProps) {
    const [productId, setProductId] = useState('');
    const [submissionId, setSubmissionId] = useState('');
    const [submission, setSubmission] = useState<Submission | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleFetch = async () => {
        if(!productId || !submissionId) return;
        setLoading(true);
        setError('');
        try {
            const data = await GetSubmission(token, productId, submissionId);
            setSubmission(data as any);
        } catch (e: any) {
            setError(e.toString());
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex justify-center items-center h-full">
            <Card className="w-[500px]">
                <CardHeader>
                    <CardTitle>Select Submission</CardTitle>
                    <CardDescription>Enter the Product and Submission IDs.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-2">
                            <Label>Product ID</Label>
                            <Input value={productId} onChange={e => setProductId(e.target.value)} placeholder="123456..." />
                        </div>
                        <div className="space-y-2">
                            <Label>Submission ID</Label>
                            <Input value={submissionId} onChange={e => setSubmissionId(e.target.value)} placeholder="11529..." />
                        </div>
                    </div>

                    <Button variant="secondary" className="w-full" onClick={handleFetch} isLoading={loading} disabled={!productId || !submissionId}>
                        Fetch Details
                    </Button>

                    {error && <div className="text-destructive text-sm bg-destructive/10 p-2 rounded">{error}</div>}

                    {submission && (
                        <div className="bg-muted p-4 rounded text-sm space-y-1 mt-4">
                            <div className="font-semibold text-foreground">Submission Found</div>
                            <div>Name: {submission.name || 'N/A'}</div>
                            <div>State: {submission.workflowStatus?.state || 'Unknown'}</div>
                            <div>Step: {submission.workflowStatus?.currentStep || 'Unknown'}</div>
                        </div>
                    )}
                </CardContent>
                <CardFooter className="flex justify-end">
                    <Button onClick={() => submission && onNext(submission)} disabled={!submission}>
                        Next: Analyze Metadata
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
