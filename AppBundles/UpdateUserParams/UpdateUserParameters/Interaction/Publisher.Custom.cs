using System.Collections.Generic;
using Autodesk.Forge.DesignAutomation.Model;

namespace Interaction
{
    /// <summary>
    /// Customizable part of Publisher class.
    /// </summary>
    internal partial class Publisher
    {
        /// <summary>
        /// Constants.
        /// </summary>
        private static class Constants
        {
            private const int EngineVersion = 24;
            public static readonly string Engine = $"Autodesk.Inventor+{EngineVersion}";

            public const string Description = "PUT DESCRIPTION HERE";

            internal static class Bundle
            {
                public static readonly string Id = "UpdateModel";
                public const string Label = "prod";

                public static readonly AppBundle Definition = new AppBundle
                {
                    Engine = Engine,
                    Id = Id,
                    Description = Description
                };
            }

            internal static class Activity
            {
                public static readonly string Id = Bundle.Id;
                public const string Label = Bundle.Label;
            }

            internal static class Parameters
            {
                public const string inputFile = nameof(inputFile);
                public const string inputParams = nameof(inputParams);
                public const string documentParams = nameof(documentParams);
                public const string outputAssembly = nameof(outputAssembly);
                public const string outputViewable = nameof(outputViewable);
            }
        }


        /// <summary>
        /// Get command line for activity.
        /// </summary>
        private static List<string> GetActivityCommandLine()
        {
            return new List<string> { $"$(engine.path)\\InventorCoreConsole.exe /al $(appbundles[{Constants.Activity.Id}].path)" };
        }

        /// <summary>
        /// Get activity parameters.
        /// </summary>
        private static Dictionary<string, Parameter> GetActivityParams()
        {
            return new Dictionary<string, Parameter>
                    {
                        {
                            Constants.Parameters.inputFile,
                            new Parameter
                            {
                                Verb = Verb.Get,
                                Description = "Input assembly to extract parameters",
                                LocalName = "inputFile",
                                Zip = true
                            }
                        },
                        {
                            Constants.Parameters.inputParams,
                            new Parameter
                            {
                                Verb = Verb.Get,
                                Description = "Input json file tells what to load and from where",
                                LocalName = "inputParams.json"
                            }
                        },
                        {
                            Constants.Parameters.documentParams,
                            new Parameter
                            {
                                Verb = Verb.Get,
                                Description = "Json file containing User Parameters",
                                LocalName = "documentParams.json"
                            }
                        },
                       {
                            Constants.Parameters.outputAssembly,
                            new Parameter
                            {
                                Verb = Verb.Put,
                                LocalName = "result.zip",
                                Description = "Resulting Inventor Assembly",
                                Required = false
                            }
                        },
                        {
                            Constants.Parameters.outputViewable,
                            new Parameter
                            {
                                Verb = Verb.Put,
                                LocalName = "viewable.zip",
                                Description = "Resulting Forge Viewable",
                                Required = false
                            }
                        }
                    };
        }

        /// <summary>
        /// Get arguments for workitem.
        /// </summary>
        private static Dictionary<string, IArgument> GetWorkItemArgs()
        {
            // TODO: update the URLs below with real values
            return new Dictionary<string, IArgument>
                    {
                        //{
                        //    Constants.Parameters.InventorDoc,
                        //    new XrefTreeArgument
                        //    {
                        //        Url = "!!! CHANGE ME !!!"
                        //    }
                        //},
                        //{
                        //    Constants.Parameters.OutputIpt,
                        //    new XrefTreeArgument
                        //    {
                        //        Verb = Verb.Put,
                        //        Url = "!!! CHANGE ME !!!"
                        //    }
                        //}
                    };
        }
    }
}
