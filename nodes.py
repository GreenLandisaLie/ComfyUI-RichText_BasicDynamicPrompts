import os
import re
import math
import random
from typing import Dict


WILDCARD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wildcards')

DEFAULT_PROMPT = r"""
### Large comment

## COMBINATIONS

# They use '{' and '}' delimiters with '|' as separator.
# Distribution is even by default but you can specify custom choice distribution using 'N::' prefix where N is a number from 0 to 1.
# Examples:
   
    A {red|blue} car. # 50% chance for both red and blue
    A {green|} bird.   # 50% chance for 'green' and 50% for empty string

    {0.1::green|0.2::yellow|{pink|red}} background. # 10% chance for green, 20% for yellow and 70% for {pink|red}

## WILDCARDS

# These pull a random non-empty line from a TXT file directly stored in 'wildcard_directory' (sub-directories are ignored).
# They use double underscore delimiters and its content should be the filename without extension.
# When 'wildcard_directory\filename.txt' does not exist -> the __filename__ string will remain in the prompt.
# You can add comments and combinations within wildcards but try not to create infinite loops when doing so - the node has safety against that though.

    __ThisIsAWildCard__ # pulls from 'wildcard_directory\ThisIsAWildCard.txt' but I don't have that file so this string will appear in the final prompt


# There is also highlighting for:
    <lora:someLoraName:1:1> # in case you want to use Lora Loaders that activate via prompt
    # NOTE: you can do combinations using lora triggers (like the one above) as choices but that will not work well when you use BATCH_SIZE > 1
# AND word weightning:
    (car or something:1.2)

## Advanced example:
{
     0.1:: __something__
    |0.9:: {0.7::(__somethingElse__:1.3)|}
}

## This node has a bunch of flaws and missing Highlight rules I'd like to add but its too hard for me so I'll just leave it as it is. Feel free to push PR's or otherwise use this as a reference for your own nodes
"""

def dynamic_prompts(
    prompt: str, 
    seed: int, 
    line_suffix: str = "", 
    single_line_output: bool = True,
    remove_whitespaces: bool = True,
    remove_empty_tags: bool = True,
    wildcard_dir: str = WILDCARD_DIR) -> str: # 'replacements' removed
    
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
        
        def replace_match(match):
            wildcard_name = match.group(1)
            
            if wildcard_name.lower().endswith('.txt'):
                wildcard_name = wildcard_name[:-4]
    
            # Search for the file in a case-insensitive manner
            for filename in os.listdir(wildcard_dir):
                base_name, ext = os.path.splitext(filename)
                if ext.lower() == '.txt' and base_name.lower() == wildcard_name.lower():
                    filepath = os.path.join(wildcard_dir, filename)
                    try:
                        with open(filepath, 'r', encoding='utf-8') as f:
                            file_content = f.read()
                            
                            # --- MODIFIED LOGIC START ---
                            # 1. Split by newlines and filter out empty and comment lines
                            # The lines list now contains only valid choices: 'A', '{C|D} # E'
                            lines = []
                            for line in file_content.splitlines():
                                trimmed_line = line.strip()
                                # Ignore empty lines or lines starting with a comment
                                if trimmed_line and not trimmed_line.startswith('#'):
                                    # Remove trailing comment for the final selected line
                                    # This ensures '{C|D} # E' becomes '{C|D}' for processing
                                    comment_start_index = trimmed_line.find('#')
                                    if comment_start_index != -1:
                                        lines.append(trimmed_line[:comment_start_index].strip())
                                    else:
                                        lines.append(trimmed_line)
                                        
                            if lines:
                                # 2. Select ONE random line from the cleaned list
                                selected_line = random.choice(lines)
                                
                                # 3. Return the selected line (which may contain combinations or wildcards)
                                return selected_line
                            else:
                                return "" # Return empty string if file is empty or only comments
                            # --- MODIFIED LOGIC END ---
                            
                    except Exception as e:
                        print(f"Error reading file {filepath}: {e}")
                        return match.group(0)
            
            # If no matching file is found, return the original substring
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
    
    



class SILVER_BasicDynamicPrompts:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
                "line_suffix": ("STRING", {"multiline": False, "default": "", "dynamicPrompts": False}),
                "single_line_output": ("BOOLEAN", {"default": True}),
                "remove_whitespaces": ("BOOLEAN", {"default": True}),
                "remove_empty_tags": ("BOOLEAN", {"default": True}),
            },
            "optional": {
                "wildcard_directory": ("STRING", {"multiline": False, "default": WILDCARD_DIR, "dynamicPrompts": False}),
                "prompt": ("STRING", {"multiline": True, "default": DEFAULT_PROMPT, "dynamicPrompts": False}),
            },
        }

    RETURN_TYPES = ("STRING","STRING",)
    RETURN_NAMES = ("prompt", "original_prompt", )
    FUNCTION = "main"
    CATEGORY = "Dynamic Prompts"
    DESCRIPTION = """
Basic Dynamic Prompts Node with Rich-Text.

Usage of combinations with {} delimiters and | separator is allowed.
Wildcards format is: __filenameWithoutTXT__ (double underscore encasing).
You can nest wildcards within combinations and combinations within wildcards.

Examples:

{red|blue} # this gives 50% chance for both red and blue
{0.1::red|0.9::blue} # this gives 10% chance for red and 90% chance for blue
__colors__ # this pulls a random non-empty line from wildcard_directory\colors.txt
{|__colors__} {0.75::__cars__|0.1::{dog|cat}|0.15::__clothing__} # advanced usage that combines nesting and controlled distribution


INPUTS:

single_line_output: This must be True for multi-line combinations to work.
line_suffix: Appends this string to the end of every line. Useful to automate suffixing of tags and descriptive text with either commas or single dots.
remove_whitespaces: Trims every line and converts multiple spaces to single space, ex: '   ' -> ' '. Also removes empty lines.
remove_empty_tags: 'tags' here is anything between dots or commas. Fixes cases like this: 'cat, ,  , dog' -> 'cat, dog'.
wildcard_directory: The directory where TXT wildcard files are stored. Subdirectories are ignored.
"""

    def main(self, seed, line_suffix, single_line_output, remove_whitespaces, remove_empty_tags, wildcard_directory, prompt):
        return (dynamic_prompts(prompt = prompt, seed = seed, line_suffix = line_suffix, single_line_output = single_line_output, remove_whitespaces = remove_whitespaces, remove_empty_tags = remove_empty_tags, wildcard_dir = wildcard_directory), prompt)




NODE_CLASS_MAPPINGS = {
    "SILVER_BasicDynamicPrompts": SILVER_BasicDynamicPrompts,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SILVER_BasicDynamicPrompts": "[Silver] Rich Text Basic Dynamic Prompts",
}
