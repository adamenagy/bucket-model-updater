/////////////////////////////////////////////////////////////////////
// Copyright (c) Autodesk, Inc. All rights reserved
// Written by Forge Partner Development
//
// Permission to use, copy, modify, and distribute this software in
// object code form for any purpose and without fee is hereby granted,
// provided that the above copyright notice appears in all copies and
// that both that copyright notice and the limited warranty and
// restricted rights notice below appear in all supporting
// documentation.
//
// AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
// AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
// MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
// DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
// UNINTERRUPTED OR ERROR FREE.
/////////////////////////////////////////////////////////////////////

using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Collections.Generic;

using Inventor;
using Autodesk.Forge.DesignAutomation.Inventor.Utils;

using System.IO.Compression;

using File = System.IO.File;
using Path = System.IO.Path;
using Directory = System.IO.Directory;

using Newtonsoft.Json;
using System.IO;
using Newtonsoft.Json.Linq;

namespace UpdateUserParametersPlugin
{
  [ComVisible(true)]
  public class SampleAutomation
  {
    private readonly InventorServer inventorApplication;
    private Boolean isVerbose = false;

    public SampleAutomation(InventorServer inventorApp)
    {
      inventorApplication = inventorApp;
    }

    public void listFolderContents(string folder, string tab = ">> ")
    {
      string[] files = Directory.GetFiles(folder);
      foreach (string file in files)
      {
        LogTrace(tab + file);
      }

      string[] directories = Directory.GetDirectories(folder);
      foreach (string directory in directories)
      {
        LogTrace(tab + directory);
        listFolderContents(directory, ">>" + tab);
      }
    }

    // We have to move the folder separation into the file name
    // e.g. "myfolder"\"myassembly.iam" => "myfolder\myassembly.iam"
    // On windows we might have to URL encode this, i.e.
    // "myfolder%2Fmyassembly.iam"
    public void flattenFolder(string folder, string rootFolder, string path)
    {
      const string separator = "%2F";
      if (folder != rootFolder)
      {
        string[] filePaths = Directory.GetFiles(folder);
        foreach (string filePath in filePaths)
        {
          string fileName = path + Path.GetFileName(filePath);
          string filePathNew = Path.Combine(rootFolder, fileName);
          File.Move(filePath, filePathNew);
        }
      }

      string[] directoryPaths = Directory.GetDirectories(folder);
      foreach (string directoryPath in directoryPaths)
      {
        string directoryName = Path.GetFileName(directoryPath);
        // move its contents first
        flattenFolder(directoryPath, rootFolder, path + directoryName + separator);

        // Then delete it
        try
        {
          Directory.Delete(directoryPath);
        }
        catch (Exception ex)
        {
          LogTrace(ex.Message + ": " + directoryPath);
        }
      }
    }

    public void Run(Document placeholder /*not used*/)
    {
      LogTrace("Running v16 - open active LOD with logging - openVisible = false");
      try
      {
        // !AA! Get project path and assembly from json passed in
        // !AA! Pass in output type, assembly or SVF
        using (new HeartBeat())
        {
          string currDir = Directory.GetCurrentDirectory();

          // Uncomment out for local debug
          //string inputPath = System.IO.Path.Combine(currDir, @"../../inputFiles", "params.json");
          //Dictionary<string, string> options = JsonConvert.DeserializeObject<Dictionary<string, string>>(System.IO.File.ReadAllText(inputPath));

          Dictionary<string, string> options = JsonConvert.DeserializeObject<Dictionary<string, string>>(System.IO.File.ReadAllText("inputParams.json"));
          string outputType = options["outputType"];
          string inputFile = options["inputFile"];
          string assemblyPath = Path.GetFullPath(Path.Combine(currDir, inputFile));

          if (options.ContainsKey("verboseLogs"))
          {
            isVerbose = true;
          }

                    string fullProjectPath = null;
          if (options.ContainsKey("projectFile"))
          {
            string projectFile = options["projectFile"];
            fullProjectPath = Path.GetFullPath(Path.Combine(currDir, projectFile));

            // For debug of input data set
            //DirPrint(currDir);
            Console.WriteLine("fullProjectPath = " + fullProjectPath);

            DesignProject dp = inventorApplication.DesignProjectManager.DesignProjects.AddExisting(fullProjectPath);
            dp.Activate();
          }

          Console.WriteLine("assemblyPath = " + assemblyPath);

          Document doc = null;
          if (assemblyPath.ToUpper().EndsWith(".IAM"))
          {
            FileManager fm = inventorApplication.FileManager;
            string[] dvReps = fm.GetDesignViewRepresentations(assemblyPath);
            string dvActRep = fm.GetLastActiveDesignViewRepresentation(assemblyPath);
            LogTrace($"LastActiveDesignViewRepresentation: {dvActRep}");

            string[] lodReps = fm.GetLevelOfDetailRepresentations(assemblyPath);
            string lodActRep = fm.GetLastActiveLevelOfDetailRepresentation(assemblyPath);
            LogTrace($"LastActiveLevelOfDetailRepresentation: {lodActRep}");

            //string[] posReps = fm.GetPositionalRepresentations(assemblyPath);
            //string posActRep = fm.get

            NameValueMap openOptions = inventorApplication.TransientObjects.CreateNameValueMap();
            openOptions.Add("LevelOfDetailRepresentation", lodActRep);
            openOptions.Add("DesignViewRepresentation", dvActRep);

            doc = inventorApplication.Documents.OpenWithOptions(assemblyPath, openOptions, false);
          }
          else
          {
            doc = inventorApplication.Documents.Open(assemblyPath);
          }
          LogTrace($"Full document name: {doc.FullDocumentName}");

          // Uncomment out for local debug
          //string paramInputPath = System.IO.Path.Combine(currDir, @"../../inputFiles", "parameters.json");
          //Dictionary<string, string> parameters = JsonConvert.DeserializeObject<Dictionary<string, string>>(System.IO.File.ReadAllText(paramInputPath));

          Dictionary<string, string> parameters = JsonConvert.DeserializeObject<Dictionary<string, string>>(System.IO.File.ReadAllText("documentParams.json"));
          foreach (KeyValuePair<string, string> entry in parameters)
          {
            var paramName = entry.Key;
            var paramValue = entry.Value;
            LogTrace($" params: {paramName}, {paramValue}");
            ChangeParam(doc, paramName, paramValue);
          }

          LogTrace($"Getting full file name of assembly");
          var docDir = Path.GetDirectoryName(doc.FullFileName);
          var pathName = doc.FullFileName;
          doc.Update2(true);

          // Save both svf and iam for now. To optimize check output type to only save one or the other

          // Save Forge Viewer format (SVF)
          string viewableDir = SaveForgeViewable(doc);
                    //string viewableZip = Path.Combine(Directory.GetCurrentDirectory(), "viewable.zip");
                    //ZipOutput(viewableDir, viewableZip);
                    if (fullProjectPath != null)
                    {
                            var sessionDir = Path.Combine(currDir, "SvfOutput");
                        var projectDir = Path.GetDirectoryName(fullProjectPath); 
                            FixSvf(projectDir, sessionDir);
                    }
                    

                    if (isVerbose)
          {
            LogTrace(">> Start of listing folder contents (before flatten)");
            listFolderContents(currDir);
            LogTrace(">> End of listing folder contents (before flatten)");
          }

          if (!options.ContainsKey("dontFlattenFolder"))
          {
            LogTrace($"Flattening SvfOutput folder");
            flattenFolder(viewableDir, viewableDir, "");
          }

          if (isVerbose)
          {
            LogTrace(">> Start of listing folder contents (after flatten)");
            listFolderContents(currDir);
            LogTrace(">> End of listing folder contents (after flatten)");
          }

          LogTrace($"Code finished");

          doc.Save2(true);
          doc.Close(true);

          // Zip up the output assembly
          //
          // assembly lives in own folder under WorkingDir. Get the WorkingDir. We want to zip up the original zip to include things like project 
          // files and libraries
          //var zipInputDir = Path.GetDirectoryName(Path.GetDirectoryName(pathName) + "/../");
          //var fileName = Path.Combine(Directory.GetCurrentDirectory(), "result.zip"); // the name must be in sync with OutputIam localName in Activity
          //ZipOutput(zipInputDir, fileName);
        }
      }
      catch (Exception e)
      {
        LogError("Processing failed. " + e.ToString());
      }
    }

    public void RunWithArguments(Document placeholder, NameValueMap map)
    {
      LogTrace("RunWithArguments not implemented");
    }

    public void ChangeParam(dynamic doc, string paramName, string paramValue)
    {
      //using (new HeartBeat())
      {
        dynamic assemblyComponentDef = doc.ComponentDefinition;
        Parameters docParams = assemblyComponentDef.Parameters;
        UserParameters userParams = docParams.UserParameters;
        try
        {
          LogTrace($"Setting {paramName} to {paramValue}");
          UserParameter userParam = userParams[paramName];
          userParam.Expression = paramValue;
        }
        catch (Exception e)
        {
          LogError("Cannot update '{0}' parameter. ({1})", paramName, e.Message);
        }
      }
    }

    private void ZipOutput(string pathName, string fileName)
    {
      try
      {
        LogTrace($"Zipping up {fileName}");

        if (File.Exists(fileName)) File.Delete(fileName);

        // start HeartBeat around ZipFile, it could be a long operation
        using (new HeartBeat())
        {
          ZipFile.CreateFromDirectory(pathName, fileName, CompressionLevel.Fastest, false);
        }

        LogTrace($"Saved as {fileName}");
      }
      catch (Exception e)
      {
        LogError($"********Zip Failed: {e.Message}");
      }
    }

        private void FixSvf(string projectPath, string svfPath)
        {
            var materialsPath = Directory.GetFiles(svfPath, "Materials.json.gz", SearchOption.AllDirectories)[0];
            var materialsFolder = Path.GetDirectoryName(materialsPath);

            using (FileStream originalFileStream = new FileStream(materialsPath, FileMode.Open))
            {
                using (GZipStream decompressionStream = new System.IO.Compression.GZipStream(originalFileStream, mode: CompressionMode.Decompress))
                using (var sr = new StreamReader(decompressionStream))
                {
                    dynamic doc = JObject.Parse(sr.ReadToEnd());
                    foreach (var mat in doc.materials)
                    {
                        foreach (var submat in mat.Value.materials)
                        {
                            try
                            {
                                // Folder separators in the value could be either '/' or '\\'
                                var properties = submat.Value.properties;
                                var bitmap = properties.uris.unifiedbitmap_Bitmap;
                                var imageRelPath = bitmap.values[0].Value;

                                // To unify the folder separator characters ('/' vs '\\') to '\\' we use GetFullPath()
                                var imageFullPath = Path.GetFullPath(Path.Combine(materialsFolder, imageRelPath));

                                // If the image is already there, we have nothing to do
                                if (System.IO.File.Exists(imageFullPath))
                                    continue;

                                // Find missing image in Inventor project folder
                                var imageFileName = Path.GetFileName(imageFullPath);
                                var sourceImageFullPath = Directory.GetFiles(projectPath, imageFileName, SearchOption.AllDirectories)[0];

                                // Create folder if needed
                                var imageFolder = Path.GetDirectoryName(imageFullPath);
                                Directory.CreateDirectory(imageFolder);

                                System.IO.File.Copy(sourceImageFullPath, imageFullPath);
                                LogTrace("Added file " + imageFullPath);
                            }
                            catch (Exception ex)
                            {
                                LogTrace(ex.Message);
                            }
                        }
                    }
                }
            }
        }

        private string SaveForgeViewable(Document doc)
    {
      string viewableOutputDir = null;
      //using (new HeartBeat())
      {
        LogTrace($"** Saving SVF");
        try
        {
          TranslatorAddIn oAddin = null;


          foreach (ApplicationAddIn item in inventorApplication.ApplicationAddIns)
          {

            if (item.ClassIdString == "{C200B99B-B7DD-4114-A5E9-6557AB5ED8EC}")
            {
              Trace.TraceInformation("SVF Translator addin is available");
              oAddin = (TranslatorAddIn)item;
              break;
            }
            else { }
          }

          if (oAddin != null)
          {
            Trace.TraceInformation("SVF Translator addin is available");
            TranslationContext oContext = inventorApplication.TransientObjects.CreateTranslationContext();
            // Setting context type
            oContext.Type = IOMechanismEnum.kFileBrowseIOMechanism;

            NameValueMap oOptions = inventorApplication.TransientObjects.CreateNameValueMap();
            // Create data medium;
            DataMedium oData = inventorApplication.TransientObjects.CreateDataMedium();

            Trace.TraceInformation("SVF save");
            var workingDir = Directory.GetCurrentDirectory(); //Path.GetDirectoryName(doc.FullFileName);
            var sessionDir = Path.Combine(workingDir, "SvfOutput");

            // Make sure we delete any old contents that may be in the output directory first,
            // this is for local debugging. In DA4I the working directory is always clean
            if (Directory.Exists(sessionDir))
            {
              Directory.Delete(sessionDir, true);
            }

            oData.FileName = Path.Combine(sessionDir, "result.collaboration");
            var outputDir = Path.Combine(sessionDir, "output");
            var bubbleFileOriginal = Path.Combine(outputDir, "bubble.json");
            var bubbleFileNew = Path.Combine(sessionDir, "bubble.json");

            // Setup SVF options
            if (oAddin.get_HasSaveCopyAsOptions(doc, oContext, oOptions))
            {
              oOptions.set_Value("EnableExpressTranslation", false);
              oOptions.set_Value("SVFFileOutputDir", sessionDir);
              oOptions.set_Value("ExportFileProperties", true);
              oOptions.set_Value("ObfuscateLabels", false);
            }

            LogTrace($"SVF files are oputput to: {oOptions.get_Value("SVFFileOutputDir")}");

            oAddin.SaveCopyAs(doc, oContext, oOptions, oData);
            Trace.TraceInformation("SVF can be exported.");
            LogTrace($"Moving bubble file");
            File.Move(bubbleFileOriginal, bubbleFileNew);
            LogTrace($"Deleting result.collaboration");
            File.Delete(oData.FileName);

            viewableOutputDir = sessionDir;

            LogTrace($"Finished SVF generation");
          }
        }
        catch (Exception e)
        {
          LogError($"********Export to format SVF failed: {e.Message}");
          return null;
        }
      }
      return viewableOutputDir;
    }

    static void DirPrint(string sDir)
    {
      try
      {
        foreach (string d in Directory.GetDirectories(sDir))
        {
          foreach (string f in Directory.GetFiles(d))
          {
            LogTrace("file: " + f);
          }
          DirPrint(d);
        }
      }
      catch (System.Exception excpt)
      {
        Console.WriteLine(excpt.Message);
      }
    }

    #region Logging utilities

    /// <summary>
    /// Log message with 'trace' log level.
    /// </summary>
    private static void LogTrace(string format, params object[] args)
    {
      Trace.TraceInformation(format, args);
    }

    /// <summary>
    /// Log message with 'trace' log level.
    /// </summary>
    private static void LogTrace(string message)
    {
      Trace.TraceInformation(message);
    }

    /// <summary>
    /// Log message with 'error' log level.
    /// </summary>
    private static void LogError(string format, params object[] args)
    {
      Trace.TraceError(format, args);
    }

    /// <summary>
    /// Log message with 'error' log level.
    /// </summary>
    private static void LogError(string message)
    {
      Trace.TraceError(message);
    }

    #endregion
  }
}