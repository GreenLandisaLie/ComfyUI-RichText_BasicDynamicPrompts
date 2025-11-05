## ComfyUI-RichText_BasicDynamicPrompts
A node with basic Dynamic Prompts support that uses javascript to simulate a Rich Text textbox.

<img width="1078" height="1533" alt="1" src="https://github.com/user-attachments/assets/04797a4d-096b-440d-8c70-c8c18a39aadc" />

# Changelog
- v2.0.0
  - Adjust Font Size with CTRL + Mouse Wheel Up/Down 
  - Wildcards now support sub-directories like so: '__Folder1\Folder2\filename__'
  - Added LORA loading from prompt support and it supports up to 2 model/clip

- v1.1.0
  - hardcoded font case to white instead of foreground var to prevent possible conflicts whith custom ComfyUI Themes
  - fixed mouse wheel up/down overriding default's ComfyUI behavior
  - TAB key now adds 4 consequent spaces

- v1.0.0
  - Initial release
