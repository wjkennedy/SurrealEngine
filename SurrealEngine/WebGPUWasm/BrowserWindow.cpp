#include "Precomp.h"
#include <surrealwidgets/window/window.h>
#include <emscripten.h>
#include <emscripten/eventloop.h>
#include <emscripten/html5.h>
#include <cstring>

class BrowserWindow;
static BrowserWindow* activeBrowserWindow = nullptr;

class BrowserWindow : public DisplayWindow
{
public:
    enum class PendingType { KeyDown, KeyUp, KeyChar, MouseDown, MouseUp, MouseMove, MouseRawMove, MouseWheel };
    struct PendingEvent { PendingType type; InputKey key = InputKey::None; Point point{}; int dx = 0; int dy = 0; std::string chars; };
    DisplayWindowHost* host;
    bool keys[256] = {};
    bool fullscreen = false;
    std::vector<PendingEvent> pending;
    BrowserWindow(DisplayWindowHost* h) : host(h) {
        activeBrowserWindow = this;
        emscripten_set_keydown_callback(EMSCRIPTEN_EVENT_TARGET_WINDOW, this, true, Key);
        emscripten_set_keyup_callback(EMSCRIPTEN_EVENT_TARGET_WINDOW, this, true, Key);
        emscripten_set_mousedown_callback("#canvas", this, true, Mouse);
        emscripten_set_mouseup_callback(EMSCRIPTEN_EVENT_TARGET_WINDOW, this, true, Mouse);
        emscripten_set_mousemove_callback("#canvas", this, true, Mouse);
        emscripten_set_wheel_callback("#canvas", this, true, Wheel);
    }
    ~BrowserWindow() override {
        emscripten_set_keydown_callback(EMSCRIPTEN_EVENT_TARGET_WINDOW, nullptr, true, nullptr);
        emscripten_set_keyup_callback(EMSCRIPTEN_EVENT_TARGET_WINDOW, nullptr, true, nullptr);
        emscripten_set_mousedown_callback("#canvas", nullptr, true, nullptr);
        emscripten_set_mouseup_callback(EMSCRIPTEN_EVENT_TARGET_WINDOW, nullptr, true, nullptr);
        emscripten_set_mousemove_callback("#canvas", nullptr, true, nullptr);
        emscripten_set_wheel_callback("#canvas", nullptr, true, nullptr);
        if (activeBrowserWindow == this) activeBrowserWindow = nullptr;
    }
    static Point MousePosition(const EmscriptenMouseEvent& event) {
        // Client coordinates also work for mouse-up registered on window.
        double x = EM_ASM_DOUBLE({ const r = Module.canvas.getBoundingClientRect(); return ($0 - r.left) * Module.canvas.width / r.width; }, event.clientX);
        double y = EM_ASM_DOUBLE({ const r = Module.canvas.getBoundingClientRect(); return ($0 - r.top) * Module.canvas.height / r.height; }, event.clientY);
        return Point(x, y);
    }
    static EM_BOOL Key(int type, const EmscriptenKeyboardEvent* e, void* user) {
        auto w = static_cast<BrowserWindow*>(user);
        EmscriptenKeyboardEvent event{};
        std::memcpy(&event, e, sizeof(event));
        unsigned k = event.keyCode;
        if (k >= 256) return false;
        bool down = type == EMSCRIPTEN_EVENT_KEYDOWN;
        w->keys[k] = down;
        w->pending.push_back({ down ? PendingType::KeyDown : PendingType::KeyUp, static_cast<InputKey>(k) });
        if (down && std::strlen(event.key) == 1)
            w->pending.push_back({ PendingType::KeyChar, InputKey::None, {}, 0, 0, event.key });
        return true;
    }
    static EM_BOOL Mouse(int type, const EmscriptenMouseEvent* e, void* user) {
        auto w = static_cast<BrowserWindow*>(user);
        EmscriptenMouseEvent event{};
        std::memcpy(&event, e, sizeof(event));
        Point p = MousePosition(event);
        auto key = event.button == 0 ? InputKey::LeftMouse : event.button == 2 ? InputKey::RightMouse : InputKey::MiddleMouse;
        if (type == EMSCRIPTEN_EVENT_MOUSEDOWN) {
            w->keys[(unsigned)key] = true;
            w->pending.push_back({ PendingType::MouseDown, key, p });
        } else if (type == EMSCRIPTEN_EVENT_MOUSEUP) {
            w->keys[(unsigned)key] = false;
            w->pending.push_back({ PendingType::MouseUp, key, p });
        } else {
            w->pending.push_back({ PendingType::MouseMove, InputKey::None, p });
            w->pending.push_back({ PendingType::MouseRawMove, InputKey::None, {}, event.movementX, event.movementY });
        }
        return true;
    }
    static EM_BOOL Wheel(int, const EmscriptenWheelEvent* e, void* user) {
        EmscriptenWheelEvent event{};
        std::memcpy(&event, e, sizeof(event));
        auto w = static_cast<BrowserWindow*>(user);
        w->pending.push_back({ PendingType::MouseWheel, event.deltaY < 0 ? InputKey::MouseWheelUp : InputKey::MouseWheelDown, MousePosition(event.mouse) });
        return true;
    }
    void DispatchEvents() {
        std::vector<PendingEvent> events;
        events.swap(pending);
        for (const auto& event : events) {
            switch (event.type) {
            case PendingType::KeyDown: host->OnWindowKeyDown(event.key); break;
            case PendingType::KeyUp: host->OnWindowKeyUp(event.key); break;
            case PendingType::KeyChar: host->OnWindowKeyChar(event.chars); break;
            case PendingType::MouseDown: host->OnWindowMouseDown(event.point, event.key); break;
            case PendingType::MouseUp: host->OnWindowMouseUp(event.point, event.key); break;
            case PendingType::MouseMove: host->OnWindowMouseMove(event.point); break;
            case PendingType::MouseRawMove: host->OnWindowRawMouseMove(event.dx, event.dy); break;
            case PendingType::MouseWheel: host->OnWindowMouseWheel(event.point, event.key); break;
            }
        }
    }
    void SetWindowTitle(const std::string&) override {}
    void SetWindowIcon(const std::vector<std::shared_ptr<Image>>&) override {}
    void Show() override {}
    void ShowFullscreen() override { fullscreen = true; }
    void ShowMaximized() override {}
    void ShowMinimized() override {}
    void ShowNormal() override { fullscreen = false; }
    bool IsWindowFullscreen() override { return fullscreen; }
    void Hide() override {}
    void Activate() override {}
    void ShowCursor(bool enable) override { EM_ASM({Module.canvas.style.cursor = $0 ? 'default' : 'none';}, enable); }
    void LockKeyboard() override {}
    void UnlockKeyboard() override {}
    void LockCursor() override { emscripten_request_pointerlock("#canvas", true); }
    void UnlockCursor() override { emscripten_exit_pointerlock(); }
    void CaptureMouse() override {}
    void ReleaseMouseCapture() override {}
    void Update() override {}
    bool GetKeyState(InputKey key) override { return (unsigned)key < 256 && keys[(unsigned)key]; }
    void SetClientFrame(const Rect&) override {}
    Rect GetClientFrame() const override { return Rect(0, 0, GetPixelWidth(), GetPixelHeight()); }
    void SetCursor(StandardCursor, std::shared_ptr<CustomCursor>) override {}
    Size GetClientSize() const override { return Size(GetPixelWidth(), GetPixelHeight()); }
    int GetPixelWidth() const override { int w, h; emscripten_get_canvas_element_size("#canvas", &w, &h); return w; }
    int GetPixelHeight() const override { int w, h; emscripten_get_canvas_element_size("#canvas", &w, &h); return h; }
    double GetDpiScale() const override { return 1.0; }
    Point MapFromGlobal(const Point& p) const override { return p; }
    Point MapToGlobal(const Point& p) const override { return p; }
    void SetBorderColor(uint32_t) override {}
    void SetCaptionColor(uint32_t) override {}
    void SetCaptionTextColor(uint32_t) override {}
    void PresentBitmap(int,int,const uint32_t*) override {}
    std::string clipboard;
    std::string GetClipboardText() override { return clipboard; }
    void SetClipboardText(const std::string& text) override { clipboard = text; }
    void* GetNativeHandle() override { return nullptr; }
    std::vector<std::string> GetVulkanInstanceExtensions() override { return {}; }
    VkSurfaceKHR CreateVulkanSurface(VkInstance) override { return {}; }
};
class BrowserBackend : public DisplayBackend {
public:
    std::unique_ptr<DisplayWindow> Create(DisplayWindowHost* h, WidgetType, DisplayWindow*, RenderAPI) override {
        return std::make_unique<BrowserWindow>(h);
    }
    void ProcessEvents() override { if (activeBrowserWindow) activeBrowserWindow->DispatchEvents(); }
    // The Engine owns the browser frame yield. Sleeping here would nest an
    // Asyncify unwind inside the game loop and abort the WASM entrypoint.
    void RunLoop() override {}
    void ExitLoop() override {}
    struct Timer { std::function<void()> callback; long id; };
    void* StartTimer(int ms, std::function<void()> cb) override {
        auto t = new Timer{std::move(cb), 0};
        t->id = emscripten_set_interval([](void* p) { static_cast<Timer*>(p)->callback(); }, ms, t);
        return t;
    }
    void StopTimer(void* p) override { auto t = static_cast<Timer*>(p); emscripten_clear_interval(t->id); delete t; }
    Size GetScreenSize() override { int w,h; emscripten_get_canvas_element_size("#canvas", &w,&h); return Size(w,h); }
};
void InitBrowserWindow() { DisplayBackend::Set(std::make_unique<BrowserBackend>()); }

#include <surrealwidgets/core/resourcedata.h>
#include "Video/VideoPlayer.h"
namespace { std::unique_ptr<ResourceLoader> browserResources; }
ResourceLoader* ResourceLoader::Get() { return browserResources.get(); }
void ResourceLoader::Set(std::unique_ptr<ResourceLoader> loader) { browserResources=std::move(loader); }
std::vector<SingleFontData> ResourceData::LoadSystemFont() { return ResourceData::LoadFont("system"); }
std::vector<SingleFontData> ResourceData::LoadMonospaceSystemFont() { return ResourceData::LoadFont("monospace"); }
double ResourceData::GetSystemFontSize() { return 11; }
std::unique_ptr<VideoPlayer> VideoPlayer::Create(const std::string&) { throw std::runtime_error("AVI playback is not available in the UT99 browser build"); }
