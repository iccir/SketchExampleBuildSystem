# SketchExampleBuildSystem

I realized that I was spending too much time exporting/compressing/copying PNG files. I drank too much coffee and I wrote a Plugin to automate the process.

This is a public version of that Plugin, written as example code with the hope of helping others.

Begin brain dump:

--

## Overview

My ideal workflow is as follows:

1. I hit a single keyboard shortcut in a document.
2. Sketch determines which exportable layers have changed since the last export.
3. It exports those layers to a temporary location.
4. It runs `pngcrush`/`optipng`/etc.
5. It copies the crushed files into my project's build results and/or my Xcode xcassets catalog **without me specifying a save location**.

[Sketch Image Compressor](https://github.com/BohemianCoding/sketch-image-compressor) comes close to this, but it lacks Step 2 and Step 5.

--

## Setting up Output Paths

Use `Example Build System -> Edit Output Path…` to specify an output path . This path is *relative to the git repository root*.

This example contains two Sketch files:

* `ExampleProject/Art/ForWeb.sketch` provides artwork for a hypothetical web app. The output path is set to `ExampleProject/Web/images` (The web app's build system would later copy these to a web server).

* `ExampleProject/Art/ForApp.sketch` provides artwork for a hypothetical iOS app at `ExampleProject/SingleViewApp`. The output path is set to `ExampleProject/SingleViewApp/SingleViewApp/Assets.xcassets`. During a build, the plug-in will find an existing file in the `xcassets` folder and overwrite it.

Output paths are persisted using `-[MSPluginCommand setValue:forKey:onDocument:]` and `-[MSPluginCommand valueForKey:onDocument:]`. There is a limitation of one output path per document (I always use separate documents for my web resources vs. iOS resources).

--

## The Build Process

In response to a `Example Build System -> Build` command:

1. The Plugin determines the full absolute path of the output directory. The output path is loaded via `-[MSPluginCommand valueForKey:onDocument:]` and path components are removed until a `.git` folder is found. This path is ultimately passed to the shell script in Step 3.

2. An array of `MSExportRequest` objects are created using `-[MSDocument allExportableLayers]` and `+[MSExportRequest exportRequestsFromExportableLayer:exportFormats:useIDForName:]`. They are exported to a temporary location via `-[MSDocument saveArtboardOrSlice:toFile:]`.

3. For each exported file, an `NSTask` is created which calls the `process-png.sh` script. The first argument is the image file, the second argument is the absolute output path (from Step 1).

Each shell script task performs the following:

4. An existing image file is found using `find`, this allows us to target existing assets in an `xcassets` directory. If no existing file is found, we will save the crushed PNG file directly to the absolute output path.

5. The `ohSH` hash of the existing image file is compared to the `ohSH` hash of the new image file. If they are the same, we are done.

6. If they are different (or if no existing file is present): `pngcrush`, `optipng`, and `zopflipng` are ran.

7. The `ohSH` hash is written to the crushed PNG file and it is copied to location from Step 4.

--

## Acknowledgements

* Thanks to Bohemian Coding for both [Sketch](https://www.sketchapp.com) and [Sketch Image Compressor](https://github.com/BohemianCoding/sketch-image-compressor).

* Thanks to [Peter Nowell](https://twitter.com/pnowelldesign) for pointing me towards Sketch Image Compressor and [Marc Edwards](https://twitter.com/marcedwards) for chatting while I spewed coffee-induced prototype code everywhere.

* Thanks to various posts on the [Sketch Developers](http://sketchplugins.com) forum.
