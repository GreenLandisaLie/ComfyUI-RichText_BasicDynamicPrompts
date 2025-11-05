import os
import re
import math
import random
from typing import List, Tuple, Dict
from pathlib import Path

import folder_paths
from comfy.sd import load_lora_for_models
from comfy.utils import load_torch_file


WILDCARD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wildcards')

DEFAULT_PROMPT = r"""### Version 2.0.0:
### - Adjust Font Size with CTRL + Mouse Wheel Up/Down 
### - Wildcards now support sub-directories like so: '__Folder1\Folder2\filename__'
### - Added LORA loading from prompt support and it supports up to 2 model/clip  (READ THE INSTRUCTIONS BELOW)


## COMBINATIONS

# They use '{' and '}' delimiters with '|' as separator.
# Distribution is even by default but you can specify custom choice distribution using 'N::' prefix where N is a number from 0 to 1.
# Examples:
   
    A {red|blue} car.  # 50% chance for both red and blue
    A {green|} bird.   # 50% chance for 'green' and 50% for empty string

    {0.1::green|0.2::yellow|{pink|red}} background. # 10% chance for green, 20% for yellow and 70% for {pink|red}

## WILDCARDS

# These pull a random non-empty line from a TXT file directly stored in 'wildcard_directory'.
# They use double underscore delimiters and its content should be the filename without extension.
# When 'wildcard_directory\filename.txt' does not exist -> the __filename__ string will remain in the prompt.
# You can add comments and combinations within wildcards but try to not create infinite loops when doing so - the node has safety against that though.

    __ThisIsAWildCard__ # pulls from 'wildcard_directory\ThisIsAWildCard.txt' but I don't have that file so this string will appear in the final prompt
    __Folder1\Folder2\ThisIsAWildCard__ # sub-directory support - will pull from 'wildcard_directory\Folder1\Folder2\ThisIsAWildCard.txt'

## Word weightning
# This is already natively supported by ComfyUI - in case you didn't know, it reinforces the importance of the encased words.
    (car or something:1.2) # Just showcasing that these are also highlighted


## You can nest combinations and wildcards at will (ex: combination within wildcard within combination ...)

### NEW (v2.0.0): Lora Loading from prompt
## ALL INPUTS ARE OPTIONAL (you can - for instance - just load on 'model_B' and ignore 'model_A' and clips)
# Loras will only be loaded when at least 1 of the model/clip inputs is given plus you have at least 1 valid Lora pattern and 'load_loras_from_prompt' is 'true'.
# The basic pattern for this is:
    <lora:LoraFilenameWithoutExtension> # Its showing in red because I do not have a Lora with that filename. NOTE: red highlighting based on the existance of the file is exclusive for Loras (wildcards will always be yellow)
# A few more examples:
    <lora:testlora1> # Because I have a 'testlora1.safetensors' file somewhere within my LORA dir - it does not show as red
# When the strength is not specified it defaults to 1 for both MODEL and CLIP
    <lora:testlora1:0.5>     # When only 1 strength value is specified - its applied to MODEL (CLIP will default to 1)
    <lora:testlora1:0.8:0.6> # Model strength: 80% | Clip strength: 60%
    <lora:testlora1:1:0>     # Clip strength: 0%. If you have a CLIP as input you can use this trick to force a specific Lora to load on just the model
# All of the examples above did not specify which model/clip (A or B) to load - when you do that the node will attempt to load the lora on BOTH
# To specify a model simply change the 'lora' prefix to 'lora_a' or 'lora_b'
    <lora_A:testlora1> # Will only load on model_A or clip_A if they were given as inputs
    <lora_B:testlora1> # Will only load on model_B or clip_B if they were given as inputs
    <lora:testlora1>   # Loads on everything
# With this its possible to specify which Loras to load on WAN 2.1 High/Low noise models.
## NOTES AND LIMITATIONS:
#    - The same Lora will never be loaded twice. If the same Lora was used for multiple patterns then it will be loaded just once using the highest specified strengths.
#        Ex:  '<lora:something> <lora:something:0.5:2> <lora:something:3:0>' --- This would load as if you had set this single pattern: '<lora:something:3:2>'
#        Ex2: '<lora:something> <lora_A:something>' --- this will not cause the Lora to load twice on model/clip A - it will simply be loaded once on both A and B.
#    - The script loads Loras by the first filename match found. This means if you have multiple loras with the exact same filename nested in your LORA dir - only 1 of them will be loaded and it might not be the one you wanted to load. Just be sure to not have multiple Loras with the same filename even if they are in different subfolders.
#    -  The script loads the Loras using the default ComfyUI's code. This means its limited to native ComfyUI nodes and if your model/lora requires third-party Lora Loaders then it won't work and may cause some issues. Ex: Nunchaku models require Nunchaku Lora Loaders.


## Advanced example:
{
     0.1:: <lora:testlora1:0.5> __something__
    |0.9:: {0.7::(__somethingElse__:1.3)|<lora:testlora1>}
}

"""

def dynamic_prompts(
    prompt: str, 
    seed: int, 
    line_suffix: str = "", 
    single_line_output: bool = True,
    remove_whitespaces: bool = True,
    remove_empty_tags: bool = True,
    wildcard_dir: str = WILDCARD_DIR) -> str:
    
    # Updated _fix_prompt signature and logic
    def _fix_prompt(
        prompt: str, 
        line_suffix: str, 
        single_line_output: bool,
        remove_whitespaces: bool,
        remove_empty_tags: bool,
    ) -> str:
        """
        Processes the prompt by:
        1. Removing comments.
        2. Applying line suffix and optionally trimming (based on remove_whitespaces).
        3. Combining lines (based on single_line_output).
        4. Applying default prompt cleaning (e.g., ",," -> ",").
        5. Optionally removing empty tags (based on remove_empty_tags).
    
        Args:
            prompt (str): The initial string.
            line_suffix (str): String to append to each line.
            single_line_output (bool): If True, joins lines with a space; otherwise, joins with a newline.
            remove_whitespaces (bool): If True, strips lines and removes empty ones.
            remove_empty_tags (bool): If True, removes redundant separators like ' , ,' or ' , .'
    
        Returns:
            str: The modified string.
        """
        
        # --- Start of Modified Preprocessing Code ---
        cleaned_lines = []
        lines = prompt.splitlines()
    
        for line in lines:
            # Find the index of the first '#' character (comment delimiter)
            comment_start_index = line.find('#')
    
            if comment_start_index != -1:
                line_without_comment = line[:comment_start_index]
            else:
                line_without_comment = line
    
            # Apply trimming if remove_whitespaces is True
            trimmed_line = line_without_comment.strip() if remove_whitespaces else line_without_comment
            if remove_whitespaces:
                while ("  " in trimmed_line):
                    trimmed_line = trimmed_line.replace("  ", " ")
    
            # Apply the specified line_suffix
            if trimmed_line:
                # Only add suffix if the line is not empty after stripping
                final_line = trimmed_line + line_suffix
                
                # Only add non-empty lines to the cleaned list
                cleaned_lines.append(final_line)
    
        # Convert the cleaned lines back into a single/multi-line string
        # Join with " " for single line output, or "\n" for multi-line output
        joiner = " " if single_line_output else "\n"
        prompt = joiner.join(cleaned_lines)
        # --- End of Modified Preprocessing Code ---
        
        # Default cleaning replacements 
        replacements = {}
        replacements[" ,"] = ","
        replacements[",  "] = ", "
        replacements[" ."] = "."
        replacements[".  "] = ". "
        replacements[".,"] = "."
        replacements[",."] = ","
        replacements[",,"] = ","
        replacements[".."] = "."
        
        empty_tag_replacements = [".,", ",.", ",,", ".."]
        
        # Sort replacements by key length in descending order
        sorted_replacements = sorted(replacements.items(), key=lambda item: len(item[0]), reverse=True)
    
        # The replacement loop runs until no changes are made.
        while True:
            replacement_made_in_pass = False
            current_prompt_state = prompt
    
            for old_substring, new_substring in sorted_replacements:
            
                if not remove_empty_tags and old_substring in empty_tag_replacements:
                    continue
            
                temp_prompt = current_prompt_state
    
                pattern = re.compile(re.escape(old_substring), re.IGNORECASE)
    
                replacements_to_make_in_this_pass = []
                for match in pattern.finditer(temp_prompt):
                    start, end = match.span()
    
                    # Check if this match is inside any <...> tag
                    tag_start_index = temp_prompt.rfind('<', 0, start)
                    if tag_start_index != -1:
                        tag_end_index = temp_prompt.find('>', tag_start_index)
                        if tag_end_index != -1 and tag_end_index > start:
                            continue
    
                    replacements_to_make_in_this_pass.append((start, end, new_substring))
    
    
                # Apply replacements from right to left
                for start, end, new_sub in sorted(replacements_to_make_in_this_pass, key=lambda x: x[0], reverse=True):
                    current_prompt_state = current_prompt_state[:start] + new_sub + current_prompt_state[end:]
                    replacement_made_in_pass = True
    
            if not replacement_made_in_pass:
                break
    
            prompt = current_prompt_state
        
        # --- Logic for remove_empty_tags ---
        if remove_empty_tags:
            temp_prompt = prompt
            
            # Simple cleanup of spacing before running the final delimiter removal
            temp_prompt = temp_prompt.replace(", ", ",").replace(" ,", ",").replace(" .", ".").replace(". ", ".")
            temp_prompt = temp_prompt.replace(",", ", ")
            temp_prompt = re.sub(r'\.(?!\d)', '. ', temp_prompt) # replaces '.' -> '. ' Only if there is no immediate digit after the dot
            
            # Use a loop to remove sequences of a delimiter, optional space, and another delimiter.
            while True:
                initial_len = len(temp_prompt)
                # Replace pattern (separator, optional space, separator) with a single separator
                # e.g., ', , ' -> ', '
                temp_prompt = re.sub(r'([.,])\s*([.,])', r'\1 ', temp_prompt)
                
                if len(temp_prompt) == initial_len:
                    break
            
            # Final cleaning of delimiters (e.g. 'cat,, dog' -> 'cat, dog')
            temp_prompt = temp_prompt.replace(",,", ",").replace("..", ".")
            prompt = temp_prompt
            
            
        prompt = prompt.strip()
        # The existing loop to remove leading/trailing delimiters/spaces
        while prompt.startswith(",") or prompt.startswith(".") or prompt.startswith(" ") or prompt.endswith(",") or prompt.endswith(" "):
            try:
                if prompt.startswith(",") or prompt.startswith(".") or prompt.startswith(" "):
                    prompt = prompt[1:].strip() # Strip again after removing
                if prompt.endswith(",") or prompt.endswith(" "):
                    prompt = prompt[:-1].strip() # Strip again after removing
            except:
                break
        
        return prompt
    
    
    def _process_wildcards(prompt: str, wildcard_dir: str, seed: int) -> str:
        """
        Replaces substrings like '__something__' in the prompt with the content of
        the corresponding '.txt' file.
    
        If the file contains multiple lines:
        1. Empty lines and comment lines (#...) are ignored.
        2. One line is randomly selected and returned.
        
        This ensures that only one item (which may contain further dynamic syntax) is
        substituted, regardless of whether combination syntax is present in the file.
        
        Args:
            prompt (str): The input string potentially containing wildcard substrings.
            wildcard_dir (str): The directory to search for wildcard '.txt' files.
            seed (int): An integer seed for the random number generator.
    
        Returns:
            str: The prompt string with wildcards replaced by a single selected line.
        """
        if wildcard_dir is None or not os.path.isdir(wildcard_dir):
            return prompt
        
        # Seed the random number generator for wildcard selection
        random.seed(seed)
    
        # Regex to find '__something__' or '__something.txt__'
        pattern = re.compile(r'__(.+?)__')
        
        def case_insensitive_resolve(base_dir: str, path_parts: list[str]) -> str | None:
            """
            Resolves a nested path inside base_dir in a case-insensitive way.
            Only lists contents one level at a time (no recursion).
            Returns absolute path to the file if found, else None.
            """
            current_dir = base_dir
    
            for part in path_parts[:-1]:
                try:
                    entries = os.listdir(current_dir)
                except OSError:
                    return None
    
                match = next((e for e in entries if e.lower() == part.lower() and 
                            os.path.isdir(os.path.join(current_dir, e))), None)
                if not match:
                    return None
                current_dir = os.path.join(current_dir, match)
    
            # Last part should be a file (case-insensitive match for .txt)
            target_file = path_parts[-1]
            try:
                entries = os.listdir(current_dir)
            except OSError:
                return None
    
            for e in entries:
                base_name, ext = os.path.splitext(e)
                if ext.lower() == '.txt' and base_name.lower() == target_file.lower():
                    return os.path.join(current_dir, e)
    
            return None
        
        def replace_match(match):
            wildcard_name = match.group(1).strip()
    
            if wildcard_name.lower().endswith('.txt'):
                wildcard_name = wildcard_name[:-4]
    
            # Normalize separators and split into parts
            normalized = re.sub(r'[\\/]+', '/', wildcard_name)
            parts = [p for p in normalized.split('/') if p]
    
            if not parts:
                return match.group(0)
    
            # Resolve path case-insensitively
            filepath = case_insensitive_resolve(wildcard_dir, parts)
            if not filepath or not os.path.isfile(filepath):
                return match.group(0)
    
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    file_content = f.read()
    
                # Filter lines (ignore empty and comment lines)
                lines = []
                for line in file_content.splitlines():
                    trimmed = line.strip()
                    if trimmed and not trimmed.startswith('#'):
                        comment_idx = trimmed.find('#')
                        if comment_idx != -1:
                            trimmed = trimmed[:comment_idx].strip()
                        if trimmed:
                            lines.append(trimmed)
    
                if not lines:
                    return ""
    
                # Choose one random valid line
                return random.choice(lines)
    
            except Exception as e:
                print(f"Error reading file {filepath}: {e}")
                return match.group(0)
    
        return pattern.sub(replace_match, prompt)
    
    
    def _process_combinations(prompt: str, seed: int) -> str:
        """
        Replaces substrings enclosed in '{...}' with a randomly selected choice
        from their pipe-separated contents.
        """
        # Seed the random number generator
        random.seed(seed)
    
        pattern = re.compile(r'{([^}{]*)}')
    
        while True:
            match = pattern.search(prompt)
            if not match:
                break
    
            start, end = match.span()
            choices_str = match.group(1)
    
            # --- Parse choices and weights ---
            raw_choices_list = [c for c in choices_str.split('|')]
            
            weighted_choices = []
            unweighted_choices = []
            total_defined_weight = 0.0
    
            for item in raw_choices_list:
                if '::' in item:
                    try:
                        weight_str, choice_text = item.split('::', 1)
                        weight = float(weight_str)
                        if not (0 <= weight <= 1):
                            raise ValueError("Weight must be between 0 and 1.")
                        
                        weighted_choices.append((choice_text, weight))
                        total_defined_weight += weight
                    except ValueError:
                        unweighted_choices.append(item)
                else:
                    unweighted_choices.append(item)
            
            if total_defined_weight > 1.0:
                for i in range(len(weighted_choices)):
                    choice, weight = weighted_choices[i]
                    weighted_choices[i] = (choice, weight / total_defined_weight)
                total_defined_weight = 1.0
                
            remaining_weight = 1.0 - total_defined_weight
            
            if unweighted_choices:
                if remaining_weight < 0:
                    remaining_weight = 0
                    
                equal_share_for_unweighted = remaining_weight / len(unweighted_choices)
                for choice_text in unweighted_choices:
                    weighted_choices.append((choice_text, equal_share_for_unweighted))
    
            # --- Perform selection ---
            selected_choice = ""
            if not weighted_choices:
                selected_choice = ""
            else:
                choices_list = [item[0] for item in weighted_choices]
                weights_list = [item[1] for item in weighted_choices]
    
                selected_choice = random.choices(choices_list, weights=weights_list, k=1)[0]
            
            # Replace the matched inner block with the selected choice
            prompt = prompt[:start] + selected_choice + prompt[end:]
    
        return prompt
    
    
    # --- Main function body: Fix applied here ---
    
    max_proccess_count = 30
    while max_proccess_count > 0:
        
        has_wildcards = "__" in prompt
        has_combinations = "{" in prompt or "}" in prompt
        
        if not has_wildcards and not has_combinations:
            break # Exit the loop if no more dynamic content is found
        
        # Process wildcards recursively (NO _fix_prompt call here)
        if has_wildcards:
            max_subproccess_count = 10
            while max_subproccess_count > 0:
                if "__" in prompt:
                    prompt = _process_wildcards(prompt, wildcard_dir, seed)
                else:
                    break
                max_subproccess_count -= 1
        
        # Process combinations recursively (NO _fix_prompt call here)
        if has_combinations:
            max_subproccess_count = 30
            while max_subproccess_count > 0:
                if "{" in prompt or "}" in prompt:
                    prompt = _process_combinations(prompt, seed)
                else:
                    break
                max_subproccess_count -= 1
        
        max_proccess_count -= 1
    
    # 1. FINAL CLEANING: Run _fix_prompt ONCE on the fully resolved string
    prompt = _fix_prompt(
        prompt=prompt, 
        line_suffix=line_suffix, 
        single_line_output=single_line_output, 
        remove_whitespaces=remove_whitespaces, 
        remove_empty_tags=remove_empty_tags
    )
    
    return prompt
    
    
class Lora:
    def __init__(self, name: str, prompt_name: str, lora_path: str, model_weight: float, clip_weight: float, load_on_model_A: bool, load_on_model_B: bool):
        self.Name = name
        self.PromptName = prompt_name
        self.LoraPath = lora_path
        self.ModelWeight = model_weight
        self.ClipWeight = clip_weight
        self.LoadOnModel_A = load_on_model_A
        self.LoadOnModel_B = load_on_model_B


def get_available_loras_stem() -> str:
    loras = folder_paths.get_filename_list("loras")
    return ",".join([Path(f).stem.lower() for f in loras])

def parse_lora_patterns(prompt: str) -> Tuple[List[Lora], List[str], List[str], List[str], List[str]]:
    """
    Finds, extracts, and resolves Lora patterns from a prompt string.
    Handles case-insensitivity and ensures no duplicate Lora paths,
    updating weights if a higher value is encountered.
    """
    
    # outputs
    loras_to_load: List[Lora] = []
    all_patterns = re.findall(r'<(?:lora|lora_a|lora_b):[^>]+>', prompt, re.IGNORECASE)
    loras_A_to_load_patterns: List[str] = []
    loras_B_to_load_patterns: List[str] = []
    not_found_lora_names: List[str] = []
    
    lora_A_map: Dict[str, Lora] = {}
    lora_B_map: Dict[str, Lora] = {}
    
    lora_files = folder_paths.get_filename_list("loras")    
    
    pattern = r'<(lora|lora_a|lora_b):([^:>]+)(?::(\d+\.?\d*))?(?::(\d+\.?\d*))?>'
    matches = re.findall(pattern, prompt, re.IGNORECASE)
    
    for prefix, name_in_prompt, model_w_str, clip_w_str in matches:
        load_on_model_A = prefix.lower() != 'lora_b'
        load_on_model_B = prefix.lower() != 'lora_a'
        
        lora_found_name = ""
        lora_path = ""
        
        # A. Find the matching Lora file
        for lora_file in lora_files:
            stem = Path(lora_file).stem
            if stem.lower().strip() == name_in_prompt.strip().lower():
                lora_found_name = stem
                lora_path = folder_paths.get_full_path("loras", lora_file)
                break
        
        # B. Parse Weights
        model_weight = float(model_w_str) if model_w_str else 1.0
        clip_weight = float(clip_w_str) if clip_w_str else 1.0
        
        # C. Handle Results
        if lora_path:
            
            if load_on_model_A:
                
                if lora_path not in lora_A_map:
                    lora_A_map[lora_path] = Lora(
                        name=lora_found_name,
                        prompt_name=name_in_prompt,
                        lora_path=lora_path,
                        model_weight=model_weight,
                        clip_weight=clip_weight,
                        load_on_model_A=load_on_model_A,
                        load_on_model_B=load_on_model_B
                    )
                else:
                    existing_lora = lora_A_map[lora_path]
                    existing_lora.ModelWeight = max(existing_lora.ModelWeight, model_weight)
                    existing_lora.ClipWeight = max(existing_lora.ClipWeight, clip_weight)
                
            if load_on_model_B:
            
                if lora_path not in lora_B_map:
                    lora_B_map[lora_path] = Lora(
                        name=lora_found_name,
                        prompt_name=name_in_prompt,
                        lora_path=lora_path,
                        model_weight=model_weight,
                        clip_weight=clip_weight,
                        load_on_model_A=load_on_model_A,
                        load_on_model_B=load_on_model_B
                    )
                else:
                    existing_lora = lora_B_map[lora_path]
                    existing_lora.ModelWeight = max(existing_lora.ModelWeight, model_weight)
                    existing_lora.ClipWeight = max(existing_lora.ClipWeight, clip_weight)
        
        elif name_in_prompt not in not_found_lora_names:
            not_found_lora_names.append(name_in_prompt)
        
    
    # Final Population (No duplicates now, as we only load from the maps)
    # Get all unique Lora objects from Map A and Map B. 
    # Must also handle the case where a Lora is in both maps (e.g., used as <lora:name>).
    
    # A single final map to consolidate both A and B to ensure Lora objects are unique
    final_loras: Dict[str, Lora] = {}
    
    # Add all from A (first, so it can be updated by B if needed)
    for lora_a in lora_A_map.values():
        final_loras[lora_a.LoraPath] = lora_a
        
    # Merge/Update with B. If the path exists in final_loras, update ModelWeight/ClipWeight.
    # Also ensure the load flags (LoadOnModel_A, LoadOnModel_B) are correctly set for the combined object.
    for lora_b in lora_B_map.values():
        if lora_b.LoraPath in final_loras:
            lora_a = final_loras[lora_b.LoraPath]
            # Update weights (take max)
            lora_a.ModelWeight = max(lora_a.ModelWeight, lora_b.ModelWeight)
            lora_a.ClipWeight = max(lora_a.ClipWeight, lora_b.ClipWeight)
            # Ensure both load flags are set if used in either A or B map
            lora_a.LoadOnModel_A = True # Already True if it was added from A, but safe to set
            lora_a.LoadOnModel_B = True # Must be True since it came from B map
        else:
            final_loras[lora_b.LoraPath] = lora_b
            
    loras_to_load.extend(list(final_loras.values()))    
    
    for lora in loras_to_load:
        prefix = "lora" if (lora.LoadOnModel_A and lora.LoadOnModel_B) else "lora_a" if lora.LoadOnModel_A else "lora_b"
        pattern = f"<{prefix}:{lora.Name}:{lora.ModelWeight}" + ("" if lora.ClipWeight == 1.0 else f":{lora.ClipWeight}") + ">"
        if lora.LoadOnModel_A:
            loras_A_to_load_patterns.append(pattern)
        if lora.LoadOnModel_B:
            loras_B_to_load_patterns.append(pattern)
    
    return loras_to_load, all_patterns, loras_A_to_load_patterns, loras_B_to_load_patterns, not_found_lora_names



class SILVER_BasicDynamicPrompts:    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "available_loras_stem": ("STRING", {"default": get_available_loras_stem()}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "tooltip": "Giving the same seed and the exact same prompt will always return the same (output) prompt"}),
                "line_suffix": ("STRING", {"multiline": False, "default": "", "dynamicPrompts": False, "tooltip": "Appends this string to the end of every line. Useful to automate suffixing of tags and descriptive text with either commas or single dots."}),
                "single_line_output": ("BOOLEAN", {"default": True, "tooltip": "This must be True for multi-line combinations to work."}),
                "remove_whitespaces": ("BOOLEAN", {"default": True, "tooltip": "Trims every line and converts multiple spaces to single space, ex: '   ' -> ' '. Also removes empty lines."}),
                "remove_empty_tags": ("BOOLEAN", {"default": True, "tooltip": "'tags' here is anything between dots or commas. Fixes cases like this: 'cat,,  , dog' -> 'cat, dog'."}),
                "load_loras_from_prompt": ("BOOLEAN", {"default": True, "tooltip": "When this is True and either 'model_optional' or 'clip_optional' (or both) is given - will attempt to load loras based on lora patterns in the prompt. You can use this switch to quickly enable/disable lora loading functionality."}),
                "remove_loras_pattern": ("BOOLEAN", {"default": True, "tooltip": "Removes every lora pattern found from the output prompt. You probably want to keep this True."}),
                "wildcard_directory": ("STRING", {"multiline": False, "default": WILDCARD_DIR, "dynamicPrompts": False, "tooltip": "The directory where TXT wildcard files are stored."}),
            },
            "optional": {
                "model_A_optional": ("MODEL", {"tooltip": "Used to automatically load loras when 'load_loras_from_prompt' is True and the prompt contains valid lora patterns and they exist in your LORA dir."}),
                "clip_A_optional": ("CLIP", {"tooltip": "Used to automatically load loras when 'load_loras_from_prompt' is True and the prompt contains valid lora patterns and they exist in your LORA dir."}),
                "model_B_optional": ("MODEL", {"tooltip": "Used to automatically load loras when 'load_loras_from_prompt' is True and the prompt contains valid lora patterns and they exist in your LORA dir."}),
                "clip_B_optional": ("CLIP", {"tooltip": "Used to automatically load loras when 'load_loras_from_prompt' is True and the prompt contains valid lora patterns and they exist in your LORA dir."}),
                "prompt": ("STRING", {"multiline": True, "default": DEFAULT_PROMPT, "dynamicPrompts": False}),
            },
        }

    RETURN_TYPES = ("MODEL","CLIP","MODEL","CLIP","STRING","STRING","STRING","STRING","STRING",)
    RETURN_NAMES = ("model_A", "clip_A", "model_B", "clip_B", "prompt", "original_prompt", "loaded_lora_patterns_A", "loaded_lora_patterns_B", "loras_names_not_found",)
    FUNCTION = "main"
    CATEGORY = "Dynamic Prompts"
    DESCRIPTION = """
Basic Dynamic Prompts Node with Rich-Text.

Place a new instance of this node to get the full instructions.

INPUTS:

model/clip_A/B_optional: Used to automatically load loras when 'load_loras_from_prompt' is True and the prompt contains valid lora patterns and they exist in your LORA dir.

line_suffix: Appends this string to the end of every line. Useful to automate suffixing of tags and descriptive text with either commas or single dots.

single_line_output: This must be True for multi-line combinations to work.

remove_whitespaces: Trims every line and converts multiple spaces to single space, ex: '   ' -> ' '. Also removes empty lines.

remove_empty_tags: 'tags' here is anything between dots or commas. Fixes cases like this: 'cat,,  , dog' -> 'cat, dog'.

load_loras_from_prompt: When this is True and either 'model_optional' or 'clip_optional' (or both) is given - will attempt to load loras based on lora patterns in the prompt. You can use this switch to quickly enable/disable lora loading functionality.

remove_loras_pattern: Removes every lora pattern found from the output prompt. You probably want to keep this True.

wildcard_directory: The directory where TXT wildcard files are stored.
"""

    def main(self, available_loras_stem, seed, line_suffix, single_line_output, remove_whitespaces, remove_empty_tags, load_loras_from_prompt, remove_loras_pattern, wildcard_directory, model_A_optional=None, clip_A_optional=None, model_B_optional=None, clip_B_optional=None, prompt=DEFAULT_PROMPT):
        
        dp = dynamic_prompts(prompt = prompt, seed = seed, line_suffix = line_suffix, single_line_output = single_line_output, remove_whitespaces = remove_whitespaces, remove_empty_tags = remove_empty_tags, wildcard_dir = wildcard_directory)
        
        loras_to_load, all_patterns, loras_A_to_load_patterns, loras_B_to_load_patterns, not_found_lora_names = parse_lora_patterns(dp)
        
        if load_loras_from_prompt and (model_A_optional or clip_A_optional or model_B_optional or clip_B_optional):
            for lora in loras_to_load:
                try:
                    if lora.LoadOnModel_A and (model_A_optional or clip_A_optional):
                        model_A_optional, clip_A_optional = load_lora_for_models(model_A_optional, clip_A_optional, load_torch_file(lora.LoraPath, safe_load=True), lora.ModelWeight, lora.ClipWeight)
                    if lora.LoadOnModel_B and (model_B_optional or clip_B_optional):
                        model_B_optional, clip_B_optional = load_lora_for_models(model_B_optional, clip_B_optional, load_torch_file(lora.LoraPath, safe_load=True), lora.ModelWeight, lora.ClipWeight)
                except:
                    warning_suffix = "both model/clip A and B" if (lora.LoadOnModel_A and lora.LoadOnModel_B) else "model/clip A" if lora.LoadOnModel_A else "model/clip B"
                    print(f"[SILVER_BasicDynamicPrompts] WARNING: Failed to load lora: {lora.Name} on {warning_suffix}")
        else:
            loras_A_to_load_patterns.clear()
            loras_B_to_load_patterns.clear()
        
        loaded_lora_patterns_A = ', '.join(loras_A_to_load_patterns)
        loaded_lora_patterns_B = ', '.join(loras_B_to_load_patterns)
        loras_names_not_found = ', '.join(not_found_lora_names)
        
        if remove_loras_pattern and len(all_patterns) > 0:
            for pattern in all_patterns:
                dp = dp.replace(pattern, "")
            if remove_whitespaces or remove_empty_tags:
                dp = dynamic_prompts(prompt = dp, seed = seed, line_suffix = line_suffix, single_line_output = single_line_output, remove_whitespaces = remove_whitespaces, remove_empty_tags = remove_empty_tags, wildcard_dir = wildcard_directory)
        
        return (model_A_optional, clip_A_optional, model_B_optional, clip_B_optional, dp, prompt, loaded_lora_patterns_A, loaded_lora_patterns_B, loras_names_not_found)




NODE_CLASS_MAPPINGS = {
    "SILVER_BasicDynamicPrompts": SILVER_BasicDynamicPrompts,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SILVER_BasicDynamicPrompts": "[Silver] Rich Text Basic Dynamic Prompts",
}

