#include "Precomp.h"
#include "WebGLRenderDevice.h"
#include "UObject/ULevel.h"
#include <surrealwidgets/core/widget.h>
#include <GLES3/gl3.h>
#include <emscripten/html5.h>
#include <unordered_map>
#include <cstddef>

namespace {
struct Vertex { vec3 position; vec2 uv; vec2 lightUV; vec4 color; };
class WebGLRenderDevice : public RenderDevice {
    GLuint program=0, buffer=0, vao=0, white=0;
    std::unordered_map<uint64_t, GLuint> textures;
    FSceneNode scene{};
    bool ready=false;
    static GLuint Shader(GLenum type, const char* text) {
        GLuint shader=glCreateShader(type); glShaderSource(shader,1,&text,nullptr); glCompileShader(shader);
        GLint ok; glGetShaderiv(shader,GL_COMPILE_STATUS,&ok);
        if (!ok) { char log[2048]; glGetShaderInfoLog(shader,sizeof(log),nullptr,log); throw std::runtime_error(log); }
        return shader;
    }
    GLuint Texture(FTextureInfo* info, bool masked=false) {
        if (!info || !info->NumMips || !info->Mips || info->Mips[0].Data.empty()) return white;
        auto key=info->CacheID ^ (masked ? (1ull<<63) : 0);
        auto found=textures.find(key);
        if (found!=textures.end() && !info->bRealtimeChanged) return found->second;
        GLuint texture=found==textures.end() ? 0 : found->second;
        if (!texture) { glGenTextures(1,&texture); textures[key]=texture; }
        auto& mip=info->Mips[0];
        std::vector<uint8_t> pixels(mip.Width*mip.Height*4,255);
        for (size_t i=0;i<pixels.size()/4;i++) {
            auto d=pixels.data()+i*4;
            if (info->Format==TextureFormat::P8 && info->Palette) {
                auto idx=mip.Data[i]; auto c=info->Palette[idx];
                d[0]=c.R; d[1]=c.G; d[2]=c.B; d[3]=masked && idx==0 ? 0 : 255;
            } else if (info->Format==TextureFormat::BGRA8 || info->Format==TextureFormat::BGRA8_LM) {
                d[0]=mip.Data[i*4+2]; d[1]=mip.Data[i*4+1]; d[2]=mip.Data[i*4]; d[3]=mip.Data[i*4+3];
            } else if (info->Format==TextureFormat::RGBA8_) {
                for(int j=0;j<4;j++) d[j]=mip.Data[i*4+j];
            } else {
                // HDR/float lightmaps are not representable by the current
                // browser upload path. Keep the initialized white texel so
                // the map remains visible while the lightmap path is added.
            }
        }
        glBindTexture(GL_TEXTURE_2D,texture);
        glPixelStorei(0x9240 /* GL_UNPACK_FLIP_Y_WEBGL */, GL_TRUE);
        glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA,mip.Width,mip.Height,0,GL_RGBA,GL_UNSIGNED_BYTE,pixels.data());
        glPixelStorei(0x9240 /* GL_UNPACK_FLIP_Y_WEBGL */, GL_FALSE);
        glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MIN_FILTER,GL_LINEAR);
        glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MAG_FILTER,GL_LINEAR);
        glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_WRAP_S,GL_REPEAT);
        glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_WRAP_T,GL_REPEAT);
        return texture;
    }
    void Draw(const std::vector<Vertex>& vertices, FTextureInfo* texture, FTextureInfo* light, uint32_t flags, bool screen=false, GLenum mode=GL_TRIANGLE_FAN) {
        if(vertices.empty() || flags&PF_Invisible) return;
        glUseProgram(program); glBindVertexArray(vao); glBindBuffer(GL_ARRAY_BUFFER,buffer);
        glBufferData(GL_ARRAY_BUFFER,vertices.size()*sizeof(Vertex),vertices.data(),GL_STREAM_DRAW);
        mat4 matrix=screen ? mat4::identity() : scene.Projection*scene.WorldToView*scene.ObjectToWorld;
        glUniformMatrix4fv(glGetUniformLocation(program,"matrix"),1,GL_FALSE,matrix.matrix);
        glUniform1i(glGetUniformLocation(program,"screen"),screen);
        glUniform1i(glGetUniformLocation(program,"masked"),!!(flags&PF_Masked));
        glUniform1f(glGetUniformLocation(program,"lightScale"),light ? 2.0f : 1.0f);
        GLuint base=Texture(texture,flags&PF_Masked), lm=Texture(light);
        glActiveTexture(GL_TEXTURE0); glBindTexture(GL_TEXTURE_2D,base);
        glActiveTexture(GL_TEXTURE1); glBindTexture(GL_TEXTURE_2D,lm);
        glActiveTexture(GL_TEXTURE0);
        glEnable(GL_BLEND);
        if(flags&PF_Translucent) glBlendFunc(GL_ONE,GL_ONE_MINUS_SRC_COLOR);
        else if(flags&PF_Modulated) glBlendFunc(GL_DST_COLOR,GL_SRC_COLOR);
        else glBlendFunc(GL_SRC_ALPHA,GL_ONE_MINUS_SRC_ALPHA);
        glDepthMask(!(flags&(PF_Translucent|PF_Modulated)));
        if(screen) glDisable(GL_DEPTH_TEST); else glEnable(GL_DEPTH_TEST);
        glDrawArrays(mode,0,vertices.size());
    }
public:
    WebGLRenderDevice(Widget* viewport) {
        Viewport=viewport;
        EmscriptenWebGLContextAttributes attributes; emscripten_webgl_init_context_attributes(&attributes);
        attributes.majorVersion=2; attributes.alpha=false; attributes.antialias=false;
        auto context=emscripten_webgl_create_context("#canvas",&attributes);
        if(context<=0) throw std::runtime_error("Could not create WebGL 2 context");
        emscripten_webgl_make_context_current(context);
        const char* vs=R"(#version 300 es
layout(location=0) in vec3 position;
layout(location=1) in vec2 uv;
layout(location=2) in vec2 lightUV;
layout(location=3) in vec4 color;
uniform mat4 matrix; uniform bool screen;
out vec2 texCoord; out vec2 lmCoord; out vec4 vertexColor;
void main(){gl_Position=matrix*vec4(position,1.); if(!screen) gl_Position.z=2.*gl_Position.z-gl_Position.w; texCoord=uv; lmCoord=lightUV; vertexColor=color;}
)";
        const char* fs=R"(#version 300 es
precision highp float;
uniform sampler2D baseTexture; uniform sampler2D lightTexture; uniform bool masked; uniform float lightScale;
in vec2 texCoord; in vec2 lmCoord; in vec4 vertexColor; out vec4 outColor;
void main(){vec4 c=texture(baseTexture,texCoord); if(masked && c.a<.5) discard; outColor=vec4(c.rgb*texture(lightTexture,lmCoord).rgb*lightScale*vertexColor.rgb,c.a*vertexColor.a);}
)";
        GLuint vert=Shader(GL_VERTEX_SHADER,vs), frag=Shader(GL_FRAGMENT_SHADER,fs);
        program=glCreateProgram();glAttachShader(program,vert);glAttachShader(program,frag);glLinkProgram(program);
        GLint ok;glGetProgramiv(program,GL_LINK_STATUS,&ok);if(!ok) throw std::runtime_error("WebGL shader link failed");
        glDeleteShader(vert);glDeleteShader(frag);
        glUseProgram(program);glUniform1i(glGetUniformLocation(program,"baseTexture"),0);glUniform1i(glGetUniformLocation(program,"lightTexture"),1);
        glGenVertexArrays(1,&vao);glBindVertexArray(vao);glGenBuffers(1,&buffer);glBindBuffer(GL_ARRAY_BUFFER,buffer);
        const int sizes[]={3,2,2,4};const size_t offsets[]={offsetof(Vertex,position),offsetof(Vertex,uv),offsetof(Vertex,lightUV),offsetof(Vertex,color)};
        for(int i=0;i<4;i++){glEnableVertexAttribArray(i);glVertexAttribPointer(i,sizes[i],GL_FLOAT,GL_FALSE,sizeof(Vertex),(void*)offsets[i]);}
        glGenTextures(1,&white);glBindTexture(GL_TEXTURE_2D,white);uint32_t pixel=0xffffffff;
        glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA,1,1,0,GL_RGBA,GL_UNSIGNED_BYTE,&pixel);
        glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MIN_FILTER,GL_NEAREST);glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MAG_FILTER,GL_NEAREST);
        glDepthFunc(GL_LEQUAL);glDisable(GL_CULL_FACE);
    }
    ~WebGLRenderDevice(){Flush(false);glDeleteTextures(1,&white);glDeleteBuffers(1,&buffer);glDeleteVertexArrays(1,&vao);glDeleteProgram(program);}
    void Flush(bool) override {for(auto& p:textures)glDeleteTextures(1,&p.second);textures.clear();}
    void Lock(vec4,vec4,vec4 clear,uint8_t*,int*) override {glDepthMask(true);glClearColor(clear.x,clear.y,clear.z,clear.w);glClear(GL_COLOR_BUFFER_BIT|GL_DEPTH_BUFFER_BIT);}
    void Unlock(bool blit) override {if(blit && !ready){ready=true;EM_ASM({if(Module.onEngineReady)Module.onEngineReady();});}}
    void SetSceneNode(FSceneNode* f) override {if(f){scene=*f;glViewport(f->XB,Viewport->GetNativePixelHeight()-f->YB-f->Y,f->X,f->Y);}}
    void DrawComplexSurface(FSceneNode* f,FSurfaceInfo& s,FSurfaceFacet& facet) override {
        SetSceneNode(f);std::vector<Vertex> verts;
        for(unsigned i=0;i<facet.VertexCount;i++) {
            auto p=facet.Vertices[i];auto q=p-facet.MapCoords.Origin;
            float u=dot(q,facet.MapCoords.XAxis),v=dot(q,facet.MapCoords.YAxis);
            vec2 uv=s.Texture ? vec2((u-s.Texture->Pan.x)*GetUMult(*s.Texture),(v-s.Texture->Pan.y)*GetVMult(*s.Texture)) : vec2(0);
            vec2 lm=s.LightMap ? vec2((u-s.LightMap->Pan.x)*GetUMult(*s.LightMap),(v-s.LightMap->Pan.y)*GetVMult(*s.LightMap)) : vec2(0);
            verts.push_back({p,uv,lm,vec4(1)});
        }
        Draw(verts,s.Texture,s.LightMap,s.PolyFlags);
    }
    void DrawGouraudPolygon(FSceneNode* f,FTextureInfo& tex,const GouraudVertex* points,int count,uint32_t flags) override {
        SetSceneNode(f);std::vector<Vertex> verts;
        for(int i=0;i<count;i++) verts.push_back({points[i].Point,vec2(points[i].UV.x*GetUMult(tex),points[i].UV.y*GetVMult(tex)),vec2(0),vec4(points[i].Light,1)});
        Draw(verts,&tex,nullptr,flags);
    }
    void DrawTile(FSceneNode* f,FTextureInfo& tex,float x,float y,float w,float h,float u,float v,float uw,float vh,float z,vec4 color,vec4,uint32_t flags) override {
        SetSceneNode(f);float l=2*x/f->FX-1,r=2*(x+w)/f->FX-1,t=1-2*y/f->FY,b=1-2*(y+h)/f->FY;
        float U=GetUMult(tex),V=GetVMult(tex);
        Draw({{{l,t,0},{u*U,v*V},{0,0},color},{{r,t,0},{(u+uw)*U,v*V},{0,0},color},{{r,b,0},{(u+uw)*U,(v+vh)*V},{0,0},color},{{l,b,0},{u*U,(v+vh)*V},{0,0},color}},&tex,nullptr,flags,true);
    }
    void Draw3DLine(FSceneNode* f,vec4 c,uint32_t,vec3 a,vec3 b) override {SetSceneNode(f);Draw({{a,vec2(0),vec2(0),c},{b,vec2(0),vec2(0),c}},nullptr,nullptr,0,false,GL_LINES);}
    void Draw2DLine(FSceneNode* f,vec4 c,uint32_t flags,vec3 a,vec3 b) override {a={2*a.x/f->FX-1,1-2*a.y/f->FY,0};b={2*b.x/f->FX-1,1-2*b.y/f->FY,0};SetSceneNode(f);Draw({{a,vec2(0),vec2(0),c},{b,vec2(0),vec2(0),c}},nullptr,nullptr,flags,true,GL_LINES);}
    void Draw2DPoint(FSceneNode* f,vec4 c,uint32_t flags,float x,float y,float x2,float y2,float z) override {FTextureInfo tex;DrawTile(f,tex,x,y,x2-x,y2-y,0,0,1,1,z,c,vec4(0),flags);}
    void ClearZ() override {glDepthMask(true);glClear(GL_DEPTH_BUFFER_BIT);}
    void PushHit(const uint8_t*,int) override {}
    void PopHit(int,bool) override {}
    void ReadPixels(FColor* pixels) override {glReadPixels(0,0,Viewport->GetNativePixelWidth(),Viewport->GetNativePixelHeight(),GL_RGBA,GL_UNSIGNED_BYTE,pixels);}
    void EndFlash() override {}
    void PrecacheTexture(FTextureInfo& t,uint32_t flags) override {Texture(&t,flags&PF_Masked);}
    bool SupportsTextureFormat(TextureFormat f) override {return f==TextureFormat::P8||f==TextureFormat::BGRA8||f==TextureFormat::BGRA8_LM||f==TextureFormat::RGBA8_;}
    void UpdateTextureRect(FTextureInfo& t,int,int,int,int) override {bool changed=t.bRealtimeChanged;t.bRealtimeChanged=true;Texture(&t);t.bRealtimeChanged=changed;}
};
}
std::unique_ptr<RenderDevice> CreateWebGLRenderDevice(Widget* viewport){return std::make_unique<WebGLRenderDevice>(viewport);}
