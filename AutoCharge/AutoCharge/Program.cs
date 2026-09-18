using System;
using System.Management;
using System.Threading;
using PDUSPAPI;

namespace AutoCharge
{
    class Program
    {
        public static string sDevIp = "192.168.1.111";

        static void Main(string[] args)
        {
            // 检查是否提供了插口参数
            if (args.Length != 1 && args.Length != 2)
            {
                Console.WriteLine("Please provide either a socket number (1-8) or both socket number and switch status (0 or 1) as arguments.");
                return;
            }

            int socketNumber;
            if (!int.TryParse(args[0], out socketNumber) || socketNumber < 1 || socketNumber > 8)
            {
                Console.WriteLine("Invalid socket number. Please provide a number between 1 and 8.");
                return;
            }

            // 根据参数长度选择执行 Bench 或 Control 方法
            if (args.Length == 1)
            {
                Bench(socketNumber);
            }
            else if (args.Length == 2)
            {
                int switchStatus;
                if (!int.TryParse(args[1], out switchStatus) || (switchStatus != 0 && switchStatus != 1))
                {
                    Console.WriteLine("Invalid switch status. Please provide either 0 (off) or 1 (on).");
                    return;
                }
                Control(socketNumber, switchStatus == 1);
            }
        }

        static void Bench(int socketNumber)
        {
            string batteryStatus, batteryLevel;
            GetBatteryInfo(out batteryStatus, out batteryLevel);

            int batteryLevelInt = int.Parse(batteryLevel);
            // 如果电量大于30%，直接退出
            if (batteryLevelInt > 35)
            {
                Console.WriteLine("Battery level is greater than 35%, exiting program.");
                return;
            }

            // 电量小于等于30%，开始充电
            ControlCharging(socketNumber, true);

            // 每一分钟检测充电状态，直到电量大于等于85%
            while (batteryLevelInt <= 85)
            {
                Thread.Sleep(60000); // 等待1分钟
                GetBatteryInfo(out batteryStatus, out batteryLevel);
                batteryLevelInt = int.Parse(batteryLevel);
            }

            // 电量大于等于85%，停止充电
            ControlCharging(socketNumber, false);

            Console.WriteLine("Battery level is now greater than or equal to 85%, stopping charging and exiting program.");
        }

        static void Control(int socketNumber, bool switchStatus)
        {
            // 控制充电
            ControlCharging(socketNumber, switchStatus);
        }

        // 获取电池信息的方法
        static void GetBatteryInfo(out string batteryStatus, out string batteryLevel)
        {
            batteryStatus = "Unknown";
            batteryLevel = "Unknown";

            ManagementObjectSearcher searcher = new ManagementObjectSearcher("SELECT * FROM Win32_Battery");

            foreach (ManagementObject queryObj in searcher.Get())
            {
                batteryStatus = queryObj["BatteryStatus"].ToString();
                batteryLevel = queryObj["EstimatedChargeRemaining"].ToString();
            }
        }

        // 开始充电的方法，接收插口参数
        static void ControlCharging(int socketNumber, bool switchStatus)
        {
            PDUSnmp.TurnOnOff(sDevIp, socketNumber, switchStatus);
        }

    }
}
