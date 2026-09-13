#include "Utils/AlignedAlloc.h"
#include <cassert>
#include <cstdint>
#include <cstring>

int main()
{
    for (std::size_t alignment : {1u, 2u, 4u, 8u, 16u})
        for (std::size_t size : {0u, 1u, 3u, 7u, 12u, 33u})
        {
            void* p = AlignedAlloc(alignment, size);
            assert(p);
            assert(reinterpret_cast<std::uintptr_t>(p) % alignment == 0);
            std::memset(p, 0x5a, size);
            AlignedFree(p);
        }
    bool rejected = false;
    try { AlignedAlloc(16, static_cast<std::size_t>(-1)); }
    catch (const std::bad_alloc&) { rejected = true; }
    assert(rejected);
}
