import { useState, useEffect } from 'react';
import { Layout } from "./components/Layout";
import { StepIndicator } from "./components/StepIndicator";
import { AuthStep } from "./views/AuthStep";
import { SubmissionStep } from "./views/SubmissionStep";
import { MetadataStep } from "./views/MetadataStep";
import { LabelStep } from "./views/LabelStep";
import { Credential, Submission, HardwareTarget } from './types';

function App() {
    const [step, setStep] = useState(0);
    const [token, setToken] = useState('');
    const [config, setConfig] = useState<Credential>({} as any);
    const [submission, setSubmission] = useState<Submission | null>(null);
    const [targets, setTargets] = useState<HardwareTarget[]>([]);

    const steps = [
        { id: 'auth', title: 'Authentication' },
        { id: 'sub', title: 'Submission' },
        { id: 'meta', title: 'Metadata' },
        { id: 'label', title: 'Create Label' },
    ];

    const next = () => setStep(s => Math.min(s + 1, steps.length - 1));

    // Disable context menu
    useEffect(() => {
        const handleContext = (e: MouseEvent) => e.preventDefault();
        document.addEventListener('contextmenu', handleContext);
        return () => document.removeEventListener('contextmenu', handleContext);
    }, []);

    return (
        <Layout>
            <StepIndicator steps={steps} currentStep={step} />
            <div className="flex-1 overflow-hidden relative h-full">
                {step === 0 && (
                    <AuthStep onNext={(t, c) => { setToken(t); setConfig(c); next(); }} />
                )}
                {step === 1 && (
                    <SubmissionStep token={token} onNext={(s) => { setSubmission(s); next(); }} />
                )}
                {step === 2 && submission && (
                    <MetadataStep token={token} submission={submission} onNext={(t) => { setTargets(t); next(); }} />
                )}
                {step === 3 && submission && (
                    <LabelStep token={token} submission={submission} targets={targets} config={config} />
                )}
            </div>
        </Layout>
    );
}

export default App
