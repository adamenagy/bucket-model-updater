using System;
using System.Diagnostics;
using System.IO;
using Newtonsoft.Json.Linq;

namespace GetZipContents
{
  class Program
  {
    static void Main(string[] args)
    {
      Trace.WriteLine("Arguments:");
      Trace.WriteLine(args[0]);
      Trace.WriteLine(args[1]);

      // Note: zip file gets unwrapped automatically
      string inputFolder = args[0];
      string outputFileName = args[1];

      JArray contents = GetContents(inputFolder);
   
      System.IO.File.WriteAllText(outputFileName, contents.ToString());
    }

    static JArray GetContents(string inputFolder)
    {
      JArray contents = new JArray();

      string[] directories = Directory.GetDirectories(inputFolder);
      foreach (string directory in directories)
      {
        string dirName = new DirectoryInfo(directory).Name; 
        JObject item = new JObject();
        item.Add(new JProperty("name", dirName));
        item.Add(new JProperty("type", "folder"));
        item.Add(new JProperty("children", GetContents(directory)));
        contents.Add(item);
      }

      string[] files = Directory.GetFiles(inputFolder);
      foreach (string file in files)
      {
        string fileName = Path.GetFileName(file);
        JObject item = new JObject();
        item.Add(new JProperty("name", fileName));
        item.Add(new JProperty("type", "file"));
        contents.Add(item);
      }

      return contents;
    }
  }
}
