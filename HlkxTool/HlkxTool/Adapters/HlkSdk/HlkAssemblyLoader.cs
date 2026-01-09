using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;

namespace HlkxTool.Adapters.HlkSdk
{
    internal static class HlkAssemblyLoader
    {
        private static readonly string[] HlkStudioRoots = BuildHlkStudioRoots();
        private static bool _initialized;

        public static void Initialize()
        {
            if (_initialized) return;
            _initialized = true;

            AppDomain.CurrentDomain.AssemblyResolve += OnAssemblyResolve;
            Console.WriteLine("[HlkxTool] HLK assemblies will be resolved from:");

            foreach (var root in HlkStudioRoots)
            {
                Console.WriteLine("          " + root);

                if (!Directory.Exists(root))
                {
                    Console.Error.WriteLine("[HlkxTool] HLK Studio path not found: " + root);
                }
            }
        }

        private static Assembly OnAssemblyResolve(object sender, ResolveEventArgs args)
        {
            if (args == null || string.IsNullOrEmpty(args.Name)) return null;

            var assemblyName = new AssemblyName(args.Name);
            var fileName = assemblyName.Name + ".dll";

            var probedPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var studioRoot in HlkStudioRoots)
            {
                if (string.IsNullOrWhiteSpace(studioRoot) || !Directory.Exists(studioRoot)) continue;

                var candidatePath = Path.Combine(studioRoot, fileName);

                if (File.Exists(candidatePath) && probedPaths.Add(candidatePath) && TryLoadAssembly(candidatePath, out var assembly))
                {
                    return assembly;
                }

                try
                {
                    foreach (var path in Directory.EnumerateFiles(studioRoot, fileName, SearchOption.AllDirectories))
                    {
                        if (probedPaths.Add(path) && TryLoadAssembly(path, out assembly))
                        {
                            return assembly;
                        }
                    }
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine("[HlkxTool] Failed to probe HLK assembly location: " + ex.Message);
                }
            }

            Console.Error.WriteLine("[HlkxTool] Failed to find HLK assembly: " + fileName);
            return null;
        }

        private static string[] BuildHlkStudioRoots()
        {
            var roots = new[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Windows Kits", "10", "Hardware Lab Kit", "Studio"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Windows Kits", "10", "Hardware Lab Kit", "Studio")
            };

            return roots
                .Where(root => !string.IsNullOrWhiteSpace(root))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }

        private static bool TryLoadAssembly(string path, out Assembly assembly)
        {
            try
            {
                Console.WriteLine("[HlkxTool] Loading HLK assembly: " + path);
                assembly = Assembly.LoadFrom(path);
                return true;
            }
            catch (BadImageFormatException bif)
            {
                Console.Error.WriteLine("[HlkxTool] Skipping incompatible HLK assembly (architecture mismatch): " + path + " - " + bif.Message);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("[HlkxTool] Failed to load HLK assembly: " + path + " - " + ex.Message);
            }

            assembly = null;
            return false;
        }
    }
}