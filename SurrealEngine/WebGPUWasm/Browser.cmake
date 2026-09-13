# The browser target shares the engine and VM; only platform backends differ.
file(GLOB_RECURSE BROWSER_ENGINE CONFIGURE_DEPENDS SurrealEngine/*.cpp)
list(FILTER BROWSER_ENGINE EXCLUDE REGEX "/(Main[^/]*|GameApp|EditorApp|DebuggerApp)\\.cpp$")
list(FILTER BROWSER_ENGINE EXCLUDE REGEX "/RenderDevice/(Vulkan|D3D11)/|/WebGPUWasm/|/Audio/AudioPlayer\\.cpp$")
list(FILTER BROWSER_ENGINE EXCLUDE REGEX "/UI/Editor/|/Utils/UTF8Reader\\.cpp$")
file(GLOB_RECURSE BROWSER_WIDGETS CONFIGURE_DEPENDS SurrealWidgets/src/core/*.cpp SurrealWidgets/src/widgets/*.cpp SurrealWidgets/src/systemdialogs/*.cpp SurrealWidgets/src/window/stub/*.cpp)
list(FILTER BROWSER_WIDGETS EXCLUDE REGEX "resourcedata_(unix|win)\\.cpp$")
list(FILTER BROWSER_ENGINE EXCLUDE REGEX "/Video/VideoPlayer\\.cpp$|/Audio/AudioMixer\\.cpp$")
# Commandlets and crash-reporting are desktop tools. They are never reached by
# the browser game loop, but otherwise retain code in the Forge payload.
list(FILTER BROWSER_ENGINE EXCLUDE REGEX "/Commandlet/|/Utils/CrashReporter\\.cpp$")
list(APPEND BROWSER_WIDGETS SurrealWidgets/src/window/window.cpp)
add_subdirectory(Thirdparty/openmpt)
add_executable(surreal-engine ${BROWSER_ENGINE} ${BROWSER_WIDGETS}
    SurrealEngine/WebGPUWasm/MainWebGPU.cpp
    SurrealEngine/WebGPUWasm/BrowserWindow.cpp
    SurrealEngine/WebGPUWasm/WebGLRenderDevice.cpp
    Thirdparty/miniz/miniz.c
    Thirdparty/MurmurHash3/MurmurHash3.cpp)
target_include_directories(surreal-engine PRIVATE SurrealEngine SurrealWidgets/include SurrealWidgets/include/surrealwidgets SurrealWidgets/src Thirdparty Thirdparty/openmpt Thirdparty/openal-soft/include Thirdparty/miniz)
target_compile_options(surreal-engine PRIVATE -fexceptions)
target_link_libraries(surreal-engine PRIVATE openmpt)
target_link_options(surreal-engine PRIVATE -fexceptions -lopenal
    "-sASYNCIFY" "-sASYNCIFY_STACK_SIZE=1048576" "-sSTACK_SIZE=8388608"
    "-sALLOW_MEMORY_GROWTH=1" "-sINITIAL_MEMORY=268435456"
    "-sMAX_WEBGL_VERSION=2" "-sMIN_WEBGL_VERSION=2"
    "-sFORCE_FILESYSTEM=1" "-sEXIT_RUNTIME=0"
    "--embed-file" "${CMAKE_SOURCE_DIR}/SurrealEngine.pk3@/SurrealEngine.pk3"
    "-sEXPORTED_RUNTIME_METHODS=['FS','callMain']")
set_target_properties(surreal-engine PROPERTIES CXX_STANDARD 20 OUTPUT_NAME surreal-engine)
target_precompile_headers(surreal-engine PRIVATE $<$<COMPILE_LANGUAGE:CXX>:${CMAKE_SOURCE_DIR}/SurrealEngine/Precomp.h>)
