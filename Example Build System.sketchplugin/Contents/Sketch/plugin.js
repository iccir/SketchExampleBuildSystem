/*
    Sketch private methods used:

    +[MSExportRequest exportRequestsFromExportableLayer:exportFormats:useIDForName:]
    -[MSDocument allExportableLayers]
    -[MSDocument askForUserInput:initialValue:]
    -[MSDocument displayMessage:timeout:]
    -[MSDocument saveArtboardOrSlice:toFile:]
    -[_MSLayer exportOptions]
    -[_MSExportOptions exportFormats]
    -[MSPluginCommand setValue:forKey:onDocument:]
    -[MSPluginCommand valueForKey:onDocument:]
*/


var exportedEditOutputPathCommand = null;
var exportedBuildCommand          = null;

(function () { "use strict";


let sBackgroundInterval = null;
let sContext = null;
let sTasks   = [ ];
let sDoneCount = 0;
let sTotalCount = 0;
let sProgressIndex = 0;
let sTmpDir = null;

function showMessage(text, timeout)
{
    if (sContext && text) {
        log(text);
        sContext.document.displayMessage_timeout(text, timeout || 5);
    }
}


/*
    backgroundTick()
    On first call, sets up a repeating interval to call itself every 0.1 seconds.
    Checks if tasks are still running and displays a progress/done message
*/
function backgroundTick()
{
    if (!sBackgroundInterval) {
        coscript.setShouldKeepAround(true);
        sBackgroundInterval = coscript.scheduleWithRepeatingInterval_jsFunction(0.1, backgroundTick);
    }

    for (let i = 0; i < sTasks.length; i++) {
        let task = sTasks[i];

        if (!task.isRunning()) {
            sTasks.splice(i, 1);
            sDoneCount++;
        }
    }

    let percent = Math.round((sDoneCount / sTotalCount) * 100);

    if (sDoneCount >= sTotalCount) {
        if (sTmpDir) {
            NSFileManager.defaultManager().removeItemAtPath_error(sTmpDir, null);
            sTmpDir = null;
        }

        showMessage(`✅ Done!`, 2);
        coscript.setShouldKeepAround(false);
        sBackgroundInterval.cancel();
        sBackgroundInterval = null;

    } else {
        let emoji = ['🕛', '🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚'][sProgressIndex++ % 12];
        showMessage(`${emoji} Building ${sDoneCount}/${sTotalCount}, ${percent}%`);
    }
}


/*
    isDirectory(inURL: NSURL): BOOL
    Is the NSURL a directory?
*/
function isDirectory(inURL)
{
    if (!inURL) return false;

    let isDirectoryPtr = MOPointer.alloc().init();

    if (NSFileManager.defaultManager().fileExistsAtPath_isDirectory(inURL.path(), isDirectoryPtr)) {
        if (isDirectoryPtr.value()) {
            return true;
        }
    }

    return false;
}


/*
    getGitRootURLWithDocument(document: MSDocument): NSURL
    Find the NSURL representing the git repository's root of a MSDocument object
*/
function getGitRootURLWithDocument(document)
{
    if (!document) return;

    let fileURL = document.fileURL();
    if (!fileURL) return;

    let pathComponents = fileURL.pathComponents();
    if (!pathComponents) return;

    pathComponents = pathComponents.mutableCopy();

    while (pathComponents.count() > 0) {
        let dirURL = NSURL.fileURLWithPathComponents(pathComponents);
        let gitURL = dirURL.URLByAppendingPathComponent(".git");

        if (isDirectory(gitURL)) {
            return dirURL;
        }

        pathComponents.removeLastObject();
    }

    return null;
}


/*
    getExportRequestsWithDocument(document: MSDocument): Array<MSExportRequest>
    Generate an array of MSExportRequest for all exportable layers in the document
*/
function getExportRequestsWithDocument(document)
{
    let allExportableLayers = document ? document.allExportableLayers() : [ ];
    let allRequests = [ ];

    allExportableLayers.forEach(layer => {
        let exportOptions = layer.exportOptions();
        if (!exportOptions) return;

        let exportFormats = exportOptions.exportFormats();
        if (!exportFormats) return;

        let requests = MSExportRequest.exportRequestsFromExportableLayer_exportFormats_useIDForName(layer, exportFormats, true);

        (requests || [ ]).forEach(request => {
            allRequests.push(request);
        });
    });

    return allRequests;
}


/*
    buildDocumentWithOutputPath(document: MSDocument, outputPath: String): void
*/
function buildDocumentWithOutputPath(document, outputPath)
{
    // Sketch seems to reuse the same COScript if we are already running (?).
    // Check to see if sBackgroundInterval is non-null and bail if so.
    //
    if (sBackgroundInterval) return;

    let exportRequests = getExportRequestsWithDocument(document);
    if (!exportRequests.length) return;

    let tmpDir = NSTemporaryDirectory();
    tmpDir = tmpDir.stringByAppendingPathComponent(NSUUID.UUID().UUIDString())

    let errorPtr = MOPointer.alloc().init();

    if (!NSFileManager.defaultManager().createDirectoryAtPath_withIntermediateDirectories_attributes_error(tmpDir, true, null, errorPtr)) {
        showMessage("Error: Could not make temporary directory");
        return;
    }

    sTmpDir = tmpDir;

    let tasks = [ ];
    let taskLaunchPath = sContext.plugin.urlForResourceNamed("process-png.sh").path();

    exportRequests.forEach(request => {
        let tmpFile = tmpDir;
        tmpFile = tmpFile.stringByAppendingPathComponent(request.name());
        tmpFile = tmpFile.stringByAppendingPathExtension(request.format());

        document.saveArtboardOrSlice_toFile(request, tmpFile);

        let task = NSTask.alloc().init();

        task.setLaunchPath(taskLaunchPath);
        task.setArguments([ tmpFile, outputPath ]);
        task.launch();

        tasks.push(task);
    });

    sTasks = tasks;
    sDoneCount = 0;
    sTotalCount = tasks.length;

    if (tasks.length) {
        backgroundTick();
    }
}


function editOutputPathCommand(context)
{
    let command = context.command;
    if (!command) return;

    let document = context.document;
    if (!document) return;

    let documentData = document.documentData();
    if (!documentData) return;

    sContext = context;

    let outputPath = command.valueForKey_onDocument("outputPath", documentData);
    let newOutputPath = document.askForUserInput_initialValue("Edit Output Path", outputPath || "");

    if (newOutputPath !== null) {
        command.setValue_forKey_onDocument(newOutputPath, "outputPath", documentData);    
        showMessage("Output path updated to \"" + newOutputPath + "\"");
    }
}


function buildCommand(context)
{
    let command = context.command;
    let document = context.document;
    let documentData = document.documentData();

    if (!command || !document || !documentData) return;

    sContext = context;

    try {
        let outputURL = getGitRootURLWithDocument(document);
        if (!outputURL) {
            showMessage("Error: Sketch document is not in a git repository");
            return;
        }

        let outputPath = command.valueForKey_onDocument("outputPath", documentData);    
        if (!outputPath) {
            showMessage("Error: Output path not specified");
            return;
        }

        outputPath.pathComponents().forEach(pathComponent => {
            outputURL = outputURL.URLByAppendingPathComponent_isDirectory(pathComponent, true);
        });

        if (!isDirectory(outputURL)) {
            showMessage("Error: \"" + outputURL.path() + "\" is not a directory");
            return;
        }

        buildDocumentWithOutputPath(document, outputURL.path());

    } catch (e) {
        showMessage("Internal Error: " + e);
    }
}


exportedEditOutputPathCommand = editOutputPathCommand;
exportedBuildCommand = buildCommand;


}());
