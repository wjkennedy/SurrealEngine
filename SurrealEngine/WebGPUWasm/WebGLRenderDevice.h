#pragma once
#include "RenderDevice/RenderDevice.h"
std::unique_ptr<RenderDevice> CreateWebGLRenderDevice(Widget* viewport);
