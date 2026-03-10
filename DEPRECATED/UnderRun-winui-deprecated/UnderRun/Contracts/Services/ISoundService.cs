using System;

namespace UnderRun.Contracts.Services;

public interface ISoundService
{
    void PlayNotification();
    void PlayMail();
    void PlayIM();
    void PlayReminder();
    void PlayAlarm();
    void PlayCall();
    void PlaySMS();
    void PlayCalendar();
    void PlayCustomSound(Uri customSoundUri);
    void StopSound();
}
