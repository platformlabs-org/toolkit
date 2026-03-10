using System;
using Microsoft.UI.Xaml.Controls;
using UnderRun.Contracts.Services;
using Windows.Media.Core;
using Windows.Media.Playback;

namespace UnderRun.Services;

public class SoundService : ISoundService
{
    private MediaPlayer? _player;

    private void PlaySystemSound(string soundEvent)
    {
        try {
            var player = new MediaPlayer
            {
                Volume = 1.0
            };
            player.Source = MediaSource.CreateFromUri(new Uri($"ms-winsoundevent:{soundEvent}"));
            player.Play();
        } catch { /* Ignore */ }
    }

    public void PlayNotification()
    {
        var uri = new Uri("ms-appx:///Assets/Sounds/arp-bells_140bpm_D_minor.wav");
        PlayCustomSound(uri);
    }

    public void PlayMail() => PlaySystemSound("Notification.Mail");

    public void PlayIM() => PlaySystemSound("Notification.IM");

    public void PlayReminder() => PlaySystemSound("Notification.Reminder");

    public void PlayAlarm() => PlaySystemSound("Notification.Looping.Alarm");

    public void PlayCall() => PlaySystemSound("Notification.Looping.Call");

    public void PlaySMS() => PlaySystemSound("Notification.SMS");

    public void PlayCalendar() => PlaySystemSound("Notification.Calendar");

    public void PlayCustomSound(Uri customSoundUri)
    {
        try
        {
            _player?.Dispose();

            _player = new MediaPlayer
            {
                Volume = 1.0,
                IsLoopingEnabled = true
            };
            _player.Source = MediaSource.CreateFromUri(customSoundUri);
            _player.Play();
        }
        catch (Exception)
        {
            // Fail silently if sound cannot be played
        }
    }

    public void StopSound()
    {
        if (_player != null)
        {
            try {
                _player.Pause();
            } catch {}
            _player.Dispose();
            _player = null;
        }
    }
}
