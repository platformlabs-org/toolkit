using System;
using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI;

namespace UnderRun.Converters;

public class BoolToColorConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, string language)
    {
        if (value is bool isError && isError)
        {
            // Red for Error
            return new SolidColorBrush(Colors.Red);
        }
        // Default / Green / or just inherit (return null or DependencyProperty.UnsetValue usually works for inherit, but let's return a safe color)
        // Returning null allows it to fall back to default style typically, or we can pick Green.
        // The previous code implied just highlighting errors.
        return new SolidColorBrush(Colors.Green);
    }

    public object ConvertBack(object value, Type targetType, object parameter, string language)
    {
        throw new NotImplementedException();
    }
}
