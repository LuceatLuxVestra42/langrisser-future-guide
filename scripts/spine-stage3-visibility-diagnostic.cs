using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using Spine;

sealed class PagePathTextureLoader : TextureLoader {
    public void Load(AtlasPage page, string path) { page.rendererObject = path; }
    public void Unload(object texture) { }
}

sealed class VisibilityRow {
    public string skinName { get; set; }
    public float time { get; set; }
    public int nonNullAttachmentCount { get; set; }
    public int regionAttachmentCount { get; set; }
    public int meshAttachmentCount { get; set; }
    public int renderableAtlasRegionCount { get; set; }
    public Dictionary<string,int> attachmentTypes { get; set; }
}

static class Program {
    static VisibilityRow Snapshot(SkeletonData data, Animation animation, Skin skin, float time) {
        var skeleton = new Skeleton(data);
        if (skin != null) skeleton.Skin = skin;
        skeleton.SetToSetupPose();
        if (animation != null) animation.Apply(skeleton, 0f, time, true, null);
        skeleton.UpdateWorldTransform();
        int nonNull = 0, regions = 0, meshes = 0, renderable = 0;
        var types = new Dictionary<string,int>();
        for (int i = 0; i < skeleton.DrawOrder.Count; i++) {
            var attachment = skeleton.DrawOrder.Items[i].Attachment;
            if (attachment == null) continue;
            nonNull++;
            string type = attachment.GetType().Name;
            types[type] = types.TryGetValue(type, out var n) ? n + 1 : 1;
            if (attachment is RegionAttachment r) {
                regions++;
                if (r.RendererObject is AtlasRegion) renderable++;
            } else if (attachment is MeshAttachment m) {
                meshes++;
                if (m.RendererObject is AtlasRegion) renderable++;
            }
        }
        return new VisibilityRow {
            skinName = skin == null ? null : skin.Name,
            time = time,
            nonNullAttachmentCount = nonNull,
            regionAttachmentCount = regions,
            meshAttachmentCount = meshes,
            renderableAtlasRegionCount = renderable,
            attachmentTypes = types,
        };
    }

    static void Main(string[] args) {
        if (args.Length < 3) {
            Console.Error.WriteLine("usage: visibility-diagnostic <skel> <atlas> <output-json> [animation=idle_Normal]");
            Environment.Exit(2);
        }
        string skelPath = args[0];
        string atlasPath = args[1];
        string outputPath = args[2];
        string animationName = args.Length >= 4 ? args[3] : "idle_Normal";

        var atlas = new Atlas(atlasPath, new PagePathTextureLoader());
        var binary = new SkeletonBinary(atlas);
        var data = binary.ReadSkeletonData(skelPath);
        var animation = data.FindAnimation(animationName);
        var times = new List<float> { 0f, 1f/60f, 1f/30f, 0.05f, 0.1f, 0.25f, 0.5f };
        if (animation != null && animation.Duration > 0f) {
            times.Add(animation.Duration / 4f);
            times.Add(animation.Duration / 2f);
            times.Add(Math.Max(0f, animation.Duration - 0.001f));
        }
        times = times.Distinct().OrderBy(x => x).ToList();

        var skinRows = new List<object>();
        skinRows.Add(new {
            name = (string)null,
            role = "NO_EXPLICIT_SKIN",
            attachmentCount = data.DefaultSkin == null ? 0 : data.DefaultSkin.Attachments.Count,
            rows = times.Select(t => Snapshot(data, animation, null, t)).ToList(),
        });
        for (int i = 0; i < data.Skins.Count; i++) {
            var skin = data.Skins.Items[i];
            skinRows.Add(new {
                name = skin.Name,
                role = data.DefaultSkin == skin ? "DEFAULT_SKIN" : "NAMED_SKIN",
                attachmentCount = skin.Attachments.Count,
                rows = times.Select(t => Snapshot(data, animation, skin, t)).ToList(),
            });
        }

        var result = new {
            schemaVersion = 1,
            skeletonVersion = data.Version,
            defaultSkinName = data.DefaultSkin == null ? null : data.DefaultSkin.Name,
            skins = data.Skins.Select(s => new { name = s.Name, attachmentCount = s.Attachments.Count }).ToList(),
            animations = data.Animations.Select(a => new { name = a.Name, duration = a.Duration }).ToList(),
            requestedAnimation = animationName,
            requestedAnimationFound = animation != null,
            requestedAnimationDuration = animation == null ? (float?)null : animation.Duration,
            visibility = skinRows,
        };
        File.WriteAllText(outputPath, JsonSerializer.Serialize(result, new JsonSerializerOptions { WriteIndented = true }));
        Console.WriteLine(JsonSerializer.Serialize(result));
    }
}
