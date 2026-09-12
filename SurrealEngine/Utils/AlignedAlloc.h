#pragma once

#include <cstdlib>
#include <algorithm>
#include <new>

inline void* AlignedAlloc(std::size_t alignment, std::size_t size)
{
	alignment = std::max(alignment, alignof(void*));
	if (size == 0) size = alignment;
	if (size > static_cast<std::size_t>(-1) - (alignment - 1)) throw std::bad_alloc();
	size = (size + alignment - 1) / alignment * alignment;
#ifdef _MSC_VER
	void* result = _aligned_malloc(size, alignment);
#else
	void* result = std::aligned_alloc(alignment, size);
#endif
	if (!result) throw std::bad_alloc();
	return result;
}

inline void AlignedFree(void* data)
{
#ifdef _MSC_VER
	_aligned_free(data);
#else
	std::free(data);
#endif
}
