using Microsoft.Windows.Kits.Hardware.ObjectModel;
using Microsoft.Windows.Kits.Hardware.ObjectModel.Submission;
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Collections.Specialized;
using System.IO;
using System.Security.Cryptography.X509Certificates;

namespace HlkxTool.Adapters.HlkSdk
{
    internal sealed class HlkSdkMutator
    {
        private const string CertificateSubjectKeyword = "Lenovo";

        public void WhqlMergeAddSign(string packageFolderPath, string driverPath, string saveFileName)
        {
            if (string.IsNullOrWhiteSpace(packageFolderPath))
                throw new ArgumentNullException("packageFolderPath");
            if (string.IsNullOrWhiteSpace(driverPath))
                throw new ArgumentNullException("driverPath");
            if (string.IsNullOrWhiteSpace(saveFileName))
                throw new ArgumentNullException("saveFileName");

            if (!Directory.Exists(packageFolderPath))
                throw new InvalidOperationException("Package folder path does not exist: " + packageFolderPath);

            if (!Directory.Exists(driverPath))
                throw new InvalidOperationException("DriverPath must be an existing directory for WHQL mode. Current: " + driverPath);

            Console.WriteLine("[WHQL] Connecting to Package folder: " + packageFolderPath);

            string[] hlkxFiles = Directory.GetFiles(packageFolderPath, "*.hlkx");
            if (hlkxFiles.Length == 0)
                throw new InvalidOperationException("No .hlkx files found in the package folder.");

            string firstHlkxFile = hlkxFiles[0];
            PackageManager manager = new PackageManager(firstHlkxFile);

            ReadOnlyCollection<string> projectNames = manager.GetProjectNames();
            if (projectNames.Count == 0)
                throw new InvalidOperationException("No projects found in the package.");

            string projectName = projectNames[0];
            Console.WriteLine("[WHQL] Opening project: " + projectName);

            Project project = manager.GetProject(projectName);

            Console.WriteLine("[WHQL] adding drivers found at: " + driverPath);
            Console.WriteLine("[WHQL] saving package to: " + saveFileName);

            PackageWriter packageWriter = new PackageWriter(project);
            packageWriter.SetProgressActionHandler(SubmissionCreationProgressHandler);

            List<Target> targetList = new List<Target>();
            HashSet<Target> uniqueTargets = new HashSet<Target>();

            foreach (ProductInstance pi in project.GetProductInstances())
            {
                foreach (Target target in pi.GetTargets())
                {
                    if (uniqueTargets.Add(target))
                        targetList.Add(target);
                }
            }

            for (int i = 1; i < hlkxFiles.Length; i++)
            {
                Console.WriteLine("[WHQL] Merging with file: " + hlkxFiles[i]);
                StringCollection mergeErrors;

                PackageManager mergeManager = new PackageManager(hlkxFiles[i]);
                ReadOnlyCollection<string> mergeProjectNames = mergeManager.GetProjectNames();

                if (mergeProjectNames.Count > 0)
                {
                    string mergeProjectName = mergeProjectNames[0];
                    Project mergeProject = mergeManager.GetProject(mergeProjectName);

                    if (!packageWriter.Merge(mergeProject, out mergeErrors))
                    {
                        Console.WriteLine("[WHQL] Failed to merge file " + hlkxFiles[i] + ". Errors:");
                        foreach (string error in mergeErrors)
                            Console.WriteLine("Error: " + error);
                    }

                    foreach (ProductInstance mergePi in mergeProject.GetProductInstances())
                    {
                        foreach (Target target in mergePi.GetTargets())
                        {
                            if (uniqueTargets.Add(target))
                                targetList.Add(target);
                        }
                    }
                }
                else
                {
                    Console.WriteLine("[WHQL] No projects found in the file: " + hlkxFiles[i]);
                }
            }

            ReadOnlyCollection<string> localeList = ProjectManager.GetLocaleList();

            StringCollection errorMessages;
            StringCollection warningMessages;

            if (!packageWriter.AddDriver(driverPath, null, targetList.AsReadOnly(), localeList, out errorMessages, out warningMessages))
            {
                Console.WriteLine("[WHQL] Add driver failed. Errors:");
                if (errorMessages != null)
                    foreach (string msg in errorMessages)
                        Console.WriteLine("Error: " + msg);
            }

            packageWriter.Save(saveFileName);
            packageWriter.Dispose();

            SignWithCertificateIfFound(saveFileName);
        }

        public void DuaReplaceDriverAndSign(string packagePathOrFolder, string driverPath, string outputFile)
        {
            if (string.IsNullOrWhiteSpace(packagePathOrFolder))
                throw new ArgumentNullException("packagePathOrFolder");
            if (string.IsNullOrWhiteSpace(driverPath))
                throw new ArgumentNullException("driverPath");
            if (string.IsNullOrWhiteSpace(outputFile))
                throw new ArgumentNullException("outputFile");

            string[] hlkxFiles;

            if (File.Exists(packagePathOrFolder))
                hlkxFiles = new[] { packagePathOrFolder };
            else if (Directory.Exists(packagePathOrFolder))
                hlkxFiles = Directory.GetFiles(packagePathOrFolder, "*.hlkx");
            else
                throw new InvalidOperationException("PackagePath does not exist: " + packagePathOrFolder);

            if (hlkxFiles.Length == 0)
                throw new InvalidOperationException("No .hlkx files found for DUA operation.");

            string hlkx = hlkxFiles[0];
            Console.WriteLine("[DUA] Using hlkx: " + hlkx);

            PackageManager manager = new PackageManager(hlkx);
            Project project = GetSingleProject(manager);

            HashSet<string> driverIds = new HashSet<string>();

            foreach (ProductInstance pi in project.GetProductInstances())
            {
                foreach (Target target in pi.GetTargets())
                {
                    foreach (Microsoft.Windows.Kits.Hardware.ObjectModel.Driver driver in target.GetDrivers())
                    {
                        driverIds.Add(driver.Id);
                        Console.WriteLine("[DUA] Target: " + target.Name + ", DriverId: " + driver.Id);
                    }
                }
            }

            if (driverIds.Count != 1)
                throw new InvalidOperationException("Inconsistent or missing DriverIds. Cannot proceed with DUA.");

            string oldDriverId = null;
            foreach (string id in driverIds) { oldDriverId = id; break; }

            Console.WriteLine("[DUA] Replacing DriverId: " + oldDriverId);

            PackageWriter writer = new PackageWriter(project, ConnectionType.UpdatePackage);
            writer.SetProgressActionHandler(ProgressReporter("DUA"));

            StringCollection errors;
            StringCollection warnings;

            if (!writer.AddReplacementDriver(driverPath, oldDriverId, out errors, out warnings))
            {
                Console.WriteLine("[DUA] Driver replacement failed.");

                if (errors != null)
                    foreach (var err in errors)
                        Console.WriteLine("Error: " + err);

                if (warnings != null)
                    foreach (var w in warnings)
                        Console.WriteLine("Warning: " + w);

                throw new InvalidOperationException("AddReplacementDriver failed.");
            }

            writer.Save(outputFile);
            writer.Dispose();

            Console.WriteLine("[DUA] Package saved to: " + outputFile);

            SignWithCertificateIfFound(outputFile);
        }

        public void SignOnly(string packageFile, string outputFile)
        {
            if (string.IsNullOrWhiteSpace(packageFile))
                throw new ArgumentNullException("packageFile");
            if (string.IsNullOrWhiteSpace(outputFile))
                throw new ArgumentNullException("outputFile");

            if (!File.Exists(packageFile))
                throw new FileNotFoundException("Package file not found.", packageFile);

            if (!string.Equals(packageFile, outputFile, StringComparison.OrdinalIgnoreCase))
            {
                Console.WriteLine("[SIGN] Copying '" + packageFile + "' to '" + outputFile + "' ...");
                File.Copy(packageFile, outputFile, true);
            }

            Console.WriteLine("[SIGN] Signing package: " + outputFile);
            SignWithCertificateIfFound(outputFile);
        }

        private static Project GetSingleProject(PackageManager manager)
        {
            ReadOnlyCollection<string> names = manager.GetProjectNames();
            if (names == null || names.Count == 0)
                throw new InvalidOperationException("No project found in hlkx.");

            string name = names[0];
            Project project = manager.GetProject(name);
            if (project == null)
                throw new InvalidOperationException("Failed to get project '" + name + "'.");

            return project;
        }

        private static Action<PackageProgressInfo> ProgressReporter(string prefix)
        {
            return delegate (PackageProgressInfo info)
            {
                Console.WriteLine("[" + prefix + "] " + info.Current + "/" + info.Maximum + ": " + info.Message);
            };
        }

        private static void SubmissionCreationProgressHandler(PackageProgressInfo info)
        {
            Console.WriteLine("[WHQL] Package progress " + info.Current + " of " + info.Maximum + " : " + info.Message);
        }

        private static void SignWithCertificateIfFound(string packageFile)
        {
            X509Certificate2 cert = FindCertificate(CertificateSubjectKeyword);

            if (cert == null)
            {
                // 以前是 Console + return（跳过）
                // 现在改为：直接报错让流程失败
                throw new InvalidOperationException(
                    $"[SIGN] Certificate with subject containing '{CertificateSubjectKeyword}' not found. Signing is required, aborting."
                );
            }

            // 可选：更明确的失败原因（有些证书只有公钥，无法签名）
            if (!cert.HasPrivateKey)
            {
                throw new InvalidOperationException(
                    $"[SIGN] Certificate '{cert.Subject}' found but it does not contain a private key. Cannot sign."
                );
            }

            PackageManager.Sign(packageFile, cert);
            Console.WriteLine("[SIGN] Package signed successfully.");
        }

        private static X509Certificate2 FindCertificate(string subjectKeyword)
        {
            using (X509Store store = new X509Store(StoreName.My, StoreLocation.CurrentUser))
            {
                store.Open(OpenFlags.ReadOnly);

                foreach (X509Certificate2 cert in store.Certificates)
                {
                    if (!string.IsNullOrEmpty(cert.Subject) &&
                        cert.Subject.IndexOf(subjectKeyword, StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        // 关键点：clone 一份，避免 store 关闭后引用出现问题
                        return new X509Certificate2(cert);
                    }
                }

                return null;
            }
        }

    }
}
