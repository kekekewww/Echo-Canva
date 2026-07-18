# Research and Standards Map

## Foundational room acoustics

1. J. B. Allen and D. A. Berkley, "Image method for efficiently simulating small-room acoustics," Journal of the Acoustical Society of America, 65(4), 943–950, 1979. DOI: 10.1121/1.382599.
   Use: conceptual foundation for image-source reflections.

2. Carl F. Eyring, "Reverberation Time in 'Dead' Rooms," Journal of the Acoustical Society of America, 1, 217–241, 1930.
   Use: logarithmic reverberation-time estimate used in the MVP.

3. M. R. Schroeder, "Natural Sounding Artificial Reverberation," Journal of the Audio Engineering Society, 10(3), 219–223, 1962.
   Use: parallel comb and serial all-pass late reverberation.

4. J.-M. Jot and A. Chaigne, "Digital Delay Networks for Designing Artificial Reverberators," 90th AES Convention, 1991.
   Use: transition from simple Schroeder structures toward controlled delay networks/FDNs.

## Modern hybrid and interactive rendering

5. Stephan D. Ewert et al., "Computationally-efficient and perceptually-motivated rendering of diffuse reflections in room acoustics simulation," arXiv:2306.16696, 2023.
   Use: supports a hybrid design combining fast image-source early reflections with diffuse late reverberation/FDN.

6. Carl Schissler and Dinesh Manocha, "Interactive Sound Rendering on Mobile Devices using Ray-Parameterized Reverberation Filters," arXiv:1803.00430, 2018.
   Use: supports low-rate propagation estimation driving reverberation filters for interactive systems.

7. Sebastian J. Schlecht and Emanuël A. P. Habets, "Modal Decomposition of Feedback Delay Networks," IEEE Transactions on Signal Processing, 2019. DOI: 10.1109/TSP.2019.2937286; arXiv:1901.08865.
   Use: FDN theory and optional post-MVP improvement.

8. Gloria Dal Santo et al., "Efficient Optimization of Feedback Delay Networks for Smooth Reverberation," arXiv:2402.11216, 2024.
   Use: explains coloration and smoothness concerns in FDN design; not required for MVP.

## Diffraction boundary

9. Chunxiao Cao et al., "BEDRF: Bidirectional Edge Diffraction Response Function for Interactive Sound Propagation," arXiv:2306.01974, 2023.
   Use: demonstrates why genuine diffraction is a substantially more complex wave/edge path-tracing problem. The MVP therefore uses explicit portal routing and labels it as an approximation.

## Binaural inverse-processing boundary

10. Sania Gul et al., "Recycling an anechoic pre-trained speech separation deep neural network for binaural dereverberation of a single source," arXiv:2208.04626, 2022.
    Use: shows that even constrained single-source binaural dereverberation uses specialized learned priors; arbitrary lightweight de-spatialization is excluded.

## HRTF and browser audio

11. W3C, "Web Audio API 1.1."
    URL: https://www.w3.org/TR/webaudio/
    Use: normative definitions for `PannerNode`, HRTF mode, distance models, `ConvolverNode`, and `AudioWorkletProcessor`.

12. V. R. Algazi, R. O. Duda, D. M. Thompson, and C. Avendano, "The CIPIC HRTF Database," IEEE WASPAA, 2001.
    Use: background on measured HRTF datasets. The MVP does not load CIPIC directly.

13. ISO 9613-1, "Acoustics — Attenuation of sound during propagation outdoors — Part 1: Calculation of the absorption of sound by the atmosphere," 1993.
    Use: source form for P6-A's bounded, data-only molecular air-absorption helper. It is not used to make a measurement-accuracy claim.

## OpenAI and Codex

14. OpenAI, "Structured model outputs."
    URL: https://developers.openai.com/api/docs/guides/structured-outputs
    Use: strict JSON Schema for GPT-5.6 scene compilation.

15. OpenAI, "Custom instructions with AGENTS.md."
    URL: https://learn.chatgpt.com/docs/agent-configuration/agents-md
    Use: persistent Codex repository instructions and nested overrides.

16. OpenAI Build Week on Devpost.
    URL: https://openai.devpost.com/
    Use: submission requirements, deadline, tracks, and judging criteria.

## Evidence hierarchy

When implementation details disagree:

1. current official W3C/OpenAI/Devpost documentation;
2. peer-reviewed paper or author preprint;
3. this project specification;
4. tutorials/blogs;
5. intuition.

Do not cite Wikipedia as the primary technical authority in the submission.
