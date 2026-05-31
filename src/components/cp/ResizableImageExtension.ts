import Image from '@tiptap/extension-image'
import { ResizableNodeView } from '@tiptap/react'
import type { Editor } from '@tiptap/react'

/**
 * Applies alignment styles to the resizable container element.
 * Uses width: fit-content so the container wraps tightly around the image,
 * then uses margin to position it within the editor block.
 */
function applyAlignment(container: HTMLElement, alignment: string) {
  container.style.width = 'fit-content'
  container.style.maxWidth = '100%'
  if (alignment === 'center') {
    container.style.marginLeft = 'auto'
    container.style.marginRight = 'auto'
  } else if (alignment === 'right') {
    container.style.marginLeft = 'auto'
    container.style.marginRight = '0'
  } else {
    container.style.marginLeft = '0'
    container.style.marginRight = 'auto'
  }
}

/**
 * Extends the base Image extension with resizable node views and
 * additional attributes for width, height, and alignment.
 */
export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => element.getAttribute('width') || element.style.width || null,
        renderHTML: (attributes) => {
          if (!attributes.width) return {}
          return { width: attributes.width }
        },
      },
      height: {
        default: null,
        parseHTML: (element) => element.getAttribute('height') || element.style.height || null,
        renderHTML: (attributes) => {
          if (!attributes.height) return {}
          return { height: attributes.height }
        },
      },
      alignment: {
        default: 'center',
        parseHTML: (element) => element.getAttribute('data-alignment') || 'center',
        renderHTML: (attributes) => {
          return { 'data-alignment': attributes.alignment }
        },
      },
    }
  },

  addNodeView() {
    const editor = this.editor as Editor

    return ({ node, getPos, HTMLAttributes }) => {
      const img = document.createElement('img')
      img.src = HTMLAttributes.src || ''

      // Copy attributes to element
      Object.entries(HTMLAttributes).forEach(([key, value]) => {
        if (value == null) return
        if (key === 'width' || key === 'height') return
        img.setAttribute(key, String(value))
      })

      // Apply initial size
      if (node.attrs.width) {
        img.style.width = typeof node.attrs.width === 'number'
          ? `${node.attrs.width}px`
          : node.attrs.width
      }
      if (node.attrs.height) {
        img.style.height = typeof node.attrs.height === 'number'
          ? `${node.attrs.height}px`
          : node.attrs.height
      }

      img.style.maxWidth = '100%'
      img.style.borderRadius = '6px'
      img.style.display = 'block'

      const resizable = new ResizableNodeView({
        editor,
        element: img,
        node,
        getPos,
        onResize: (w, h) => {
          img.style.width = `${w}px`
          img.style.height = `${h}px`
        },
        onCommit: (w, h) => {
          const pos = getPos()
          if (pos === undefined) return
          editor.chain().setNodeSelection(pos).updateAttributes('image', {
            width: w,
            height: h,
          }).run()
        },
        onUpdate: (updatedNode) => {
          if (updatedNode.type.name !== 'image') return false
          // Update src if changed
          const newSrc = updatedNode.attrs.src
          if (newSrc && img.src !== newSrc) {
            img.src = newSrc
          }
          // Update size
          if (updatedNode.attrs.width) {
            img.style.width = typeof updatedNode.attrs.width === 'number'
              ? `${updatedNode.attrs.width}px`
              : updatedNode.attrs.width
          }
          if (updatedNode.attrs.height) {
            img.style.height = typeof updatedNode.attrs.height === 'number'
              ? `${updatedNode.attrs.height}px`
              : updatedNode.attrs.height
          }
          // Update alignment on the container
          applyAlignment(resizable.dom as HTMLElement, updatedNode.attrs.alignment || 'center')
          return true
        },
        options: {
          directions: ['bottom-right', 'bottom-left', 'top-right', 'top-left'],
          min: { width: 50, height: 50 },
          preserveAspectRatio: true,
          className: {
            container: 'madori-resize-container',
            wrapper: 'madori-resize-wrapper',
            handle: 'madori-resize-handle',
            resizing: 'is-resizing',
          },
        },
      })

      // Apply initial alignment to the container
      applyAlignment(resizable.dom as HTMLElement, node.attrs.alignment || 'center')

      return resizable
    }
  },
})
