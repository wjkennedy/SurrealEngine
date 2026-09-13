#include "Precomp.h"
#include "Engine.h"
#include "GameFolder.h"
#include "Utils/CommandLine.h"
#include "Utils/Logger.h"
#include "UI/WidgetResourceData.h"
#include <surrealwidgets/core/theme.h>
#include <emscripten.h>
#include <cstdio>

void InitBrowserWindow();
int main(int argc, char** argv)
{
    try {
        Logger::Get()->SetCallback([](const LogMessageLine& line) {
            std::fprintf(stdout, "[Engine] %s\n", line.Text.c_str());
        });
        Array<std::string> args;
        for (int i = 0; i < argc; i++) args.push_back(argv[i]);
        CommandLine cmd(args);
        commandline = &cmd;
        InitBrowserWindow();
        InitWidgetResources();
        WidgetTheme::SetTheme(std::make_unique<DarkWidgetTheme>());
        GameLaunchInfo info;
        info.engineVersion = 436;
        info.gameName = "Unreal Tournament";
        info.gameVersionString = "436";
        info.gameExecutableName = "UnrealTournament";
        info.gameRootFolder = "/ut";
        info.url = "Entry.unr";
        Engine game(info);
        game.Run();
    } catch (const std::exception& error) {
        std::fprintf(stderr, "%s\n", error.what());
        EM_ASM({ if (Module.onEngineError) Module.onEngineError(UTF8ToString($0)); }, error.what());
        return 1;
    } catch (...) {
        constexpr const char* message = "Unreal engine threw a non-standard exception during startup or tick.";
        std::fprintf(stderr, "%s\n", message);
        EM_ASM({ if (Module.onEngineError) Module.onEngineError(UTF8ToString($0)); }, message);
        return 1;
    }
    return 0;
}
